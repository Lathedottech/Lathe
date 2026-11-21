#!/usr/bin/env node
// P0-04 spike: drive `kiro-cli acp` (JSON-RPC 2.0, newline-delimited, over stdio)
// through initialize -> session/new -> session/prompt -> session/cancel and record
// every message. No dependencies. Not production code (the adapter is P4-01).
//
// Usage:
//   node scripts/spikes/acp-handshake.mjs --out <dir> --cwd <session cwd> -- <command> [args...]
// Options:
//   --prompt <text>        first prompt (default: write SPIKE_OK.txt)
//   --no-prompt            stop after session/new (handshake and auth check only)
//   --cancel-after <ms>    send a second long prompt and cancel it after <ms> (default 4000; 0 disables)
//   --timeout <ms>         per-request timeout (default 180000)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
if (sep === -1) {
  process.stderr.write('missing -- <command>\n');
  process.exit(64);
}
const opts = argv.slice(0, sep);
const [cmd, ...cmdArgs] = argv.slice(sep + 1);
const opt = (name, dflt) => {
  const i = opts.indexOf(name);
  return i === -1 ? dflt : opts[i + 1];
};
const outDir = opt('--out', 'spike-out');
const sessionCwd = opt('--cwd', process.cwd());
const prompt = opt(
  '--prompt',
  'Create a file named SPIKE_OK.txt in the current directory containing exactly the text: lathe spike ok. Do nothing else.',
);
const noPrompt = opts.includes('--no-prompt');
const cancelAfter = Number(opt('--cancel-after', '4000'));
const timeoutMs = Number(opt('--timeout', '180000'));

mkdirSync(outDir, { recursive: true });
const transcript = join(outDir, 'transcript.jsonl');
writeFileSync(transcript, '');

// Mask credentials and personal data before anything is written to disk.
const redact = (s) =>
  s
    .replace(/ksk_[A-Za-z0-9_-]+/g, 'ksk_[redacted]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email-redacted]')
    .replace(/("(?:access|refresh|id)?_?[Tt]oken"\s*:\s*")[^"]+/g, '$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, '$1[redacted]');
const t0 = Date.now();
const log = (dir, msg) =>
  appendFileSync(transcript, redact(JSON.stringify({ t: Date.now() - t0, dir, msg })) + '\n');

const summary = {
  command: [cmd, ...cmdArgs].map((a) => redact(a)),
  startedAt: new Date().toISOString(),
  steps: {},
  methodsFromAgent: {},
  sessionUpdateKinds: {},
  permissionRequests: 0,
  stderrTail: [],
  exit: null,
};
const child = spawn(cmd, cmdArgs, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let nextId = 0;
const pending = new Map();
let buf = '';

child.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      log('in-raw', line.slice(0, 2000));
      continue;
    }
    log('in', msg);
    if (
      msg.id !== undefined &&
      (msg.result !== undefined || msg.error !== undefined) &&
      pending.has(msg.id)
    ) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error)
        p.reject(Object.assign(new Error(msg.error.message ?? 'rpc error'), { rpc: msg.error }));
      else p.resolve(msg.result);
    } else if (msg.method) {
      summary.methodsFromAgent[msg.method] = (summary.methodsFromAgent[msg.method] ?? 0) + 1;
      if (msg.method === 'session/update' || msg.method === 'session/notification') {
        const kind = msg.params?.update?.sessionUpdate ?? msg.params?.update?.type ?? 'unknown';
        summary.sessionUpdateKinds[kind] = (summary.sessionUpdateKinds[kind] ?? 0) + 1;
      }
      if (msg.id !== undefined) answerAgentRequest(msg);
    }
  }
});
child.stderr.on('data', (c) => {
  for (const l of c.toString('utf8').split('\n'))
    if (l.trim()) {
      summary.stderrTail.push(redact(l).slice(0, 300));
      if (summary.stderrTail.length > 30) summary.stderrTail.shift();
    }
});
const exited = new Promise((r) =>
  child.on('exit', (code, signal) => {
    summary.exit = { code, signal };
    r();
  }),
);

function send(msg) {
  log('out', msg);
  child.stdin.write(JSON.stringify(msg) + '\n');
}
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout after ${timeoutMs} ms: ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    send({ jsonrpc: '2.0', id, method, params });
  });
}
function notify(method, params) {
  send({ jsonrpc: '2.0', method, params });
}
function answerAgentRequest(msg) {
  if (msg.method === 'session/request_permission') {
    summary.permissionRequests++;
    const options = msg.params?.options ?? [];
    const pick =
      options.find((o) => o.kind === 'allow_once') ??
      options.find((o) => String(o.kind).startsWith('allow')) ??
      null;
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: pick
        ? { outcome: { outcome: 'selected', optionId: pick.optionId } }
        : { outcome: { outcome: 'cancelled' } },
    });
  } else {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: `client does not implement ${msg.method}` },
    });
  }
}
async function step(name, fn) {
  const s = Date.now();
  try {
    const r = await fn();
    summary.steps[name] = { ok: true, ms: Date.now() - s, result: r };
    return r;
  } catch (e) {
    summary.steps[name] = { ok: false, ms: Date.now() - s, error: e.message, rpc: e.rpc ?? null };
    throw e;
  }
}

let code = 0;
try {
  const init = await step('initialize', () =>
    request('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'lathe-p0-04-spike', version: '0.0.1' },
    }),
  );
  summary.agentInfo = init?.agentInfo ?? null;
  summary.agentCapabilities = init?.agentCapabilities ?? null;
  summary.authMethods = (init?.authMethods ?? []).map((m) => m.id ?? m.name);
  const sess = await step('session/new', () =>
    request('session/new', { cwd: sessionCwd, mcpServers: [] }),
  );
  const sessionId = sess?.sessionId;
  if (!noPrompt) {
    await step('session/prompt', () =>
      request('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] }),
    );
    if (cancelAfter > 0) {
      await step('session/cancel', async () => {
        const long = request('session/prompt', {
          sessionId,
          prompt: [
            {
              type: 'text',
              text: 'List every file in this directory, then explain each one in detail, at least 600 words.',
            },
          ],
        });
        await new Promise((r) => setTimeout(r, cancelAfter));
        notify('session/cancel', { sessionId });
        return await long;
      });
    }
  }
} catch {
  code = 1;
} finally {
  child.stdin.end();
  const killer = setTimeout(() => child.kill(), 5000);
  await exited;
  clearTimeout(killer);
  summary.finishedAt = new Date().toISOString();
  writeFileSync(join(outDir, 'summary.json'), redact(JSON.stringify(summary, null, 2)) + '\n');
  process.stdout.write(
    redact(
      JSON.stringify({
        steps: Object.fromEntries(
          Object.entries(summary.steps).map(([k, v]) => [
            k,
            v.ok
              ? `ok ${v.ms}ms ${JSON.stringify(v.result)?.slice(0, 120)}`
              : `FAIL ${v.error} ${JSON.stringify(v.rpc)?.slice(0, 200)}`,
          ]),
        ),
        authMethods: summary.authMethods,
        updates: summary.sessionUpdateKinds,
        exit: summary.exit,
      }),
    ),
  );
  process.exit(code);
}
