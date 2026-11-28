import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GateContext } from '../gate.js';
import { runCommand, type CommandResult, type CommandRunner } from './process.js';
import { mapPatchLines, securityGate } from './security.js';

/** Fake token built by concatenation so repository secret scans do not flag this file. */
const FAKE_TOKEN = 'ghp_' + 'aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5';

const patchWith = (line: string): string =>
  [
    'diff --git a/apps/demo/src/a.ts b/apps/demo/src/a.ts',
    '--- a/apps/demo/src/a.ts',
    '+++ b/apps/demo/src/a.ts',
    '@@ -1,2 +1,3 @@',
    ' const a = 1;',
    `+${line}`,
    ' export {};',
    '',
  ].join('\n');

const CLEAN = patchWith('const b = 2;');
const LEAKY = patchWith(`const token = '${FAKE_TOKEN}';`);

const ok = (output = ''): CommandResult => ({ exitCode: 0, timedOut: false, output });
const AUDIT_CLEAN = JSON.stringify({
  advisories: {},
  metadata: { vulnerabilities: { low: 1, moderate: 0, high: 0, critical: 0 } },
});
const AUDIT_HIGH = JSON.stringify({
  advisories: {
    '1234': { id: 1234, module_name: 'left-pad', severity: 'high', title: 'Prototype pollution' },
  },
  metadata: { vulnerabilities: { high: 1 } },
});

let root: string;
let ctx: GateContext;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'lathe-sec-test-'));
  await mkdir(join(root, 'apps', 'demo'), { recursive: true });
  ctx = { app: 'demo', worktree: root, commit: 'a'.repeat(40), faultInjection: null, patch: CLEAN };
});
afterEach(() => rm(root, { recursive: true, force: true }));

/** Mock runner: gitleaks writes `leaks` to its report path, pnpm returns `audit`. */
function mock(opts: { leaks?: unknown[]; gitleaks?: CommandResult; audit?: CommandResult }): {
  run: CommandRunner;
  calls: string[];
} {
  const calls: string[] = [];
  const run: CommandRunner = async (spec) => {
    calls.push(`${spec.cmd} ${spec.args.join(' ')}`);
    if (spec.cmd === 'pnpm') return opts.audit ?? ok(AUDIT_CLEAN);
    const reportPath = spec.args[spec.args.indexOf('--report-path') + 1] as string;
    const leaks = opts.leaks ?? [];
    await writeFile(reportPath, JSON.stringify(leaks), 'utf8');
    return opts.gitleaks ?? { exitCode: leaks.length > 0 ? 2 : 0, timedOut: false, output: '' };
  };
  return { run, calls };
}

describe('mapPatchLines', () => {
  it('maps added lines to file and new-file line', () => {
    const m = mapPatchLines(LEAKY);
    expect(m.get(6)).toEqual({ path: 'apps/demo/src/a.ts', line: 2 });
    expect(m.get(5)).toBeUndefined();
  });
});

describe('securityGate', () => {
  it('passes a clean diff with a clean audit', async () => {
    const { run } = mock({});
    const r = await securityGate({ gitleaksBin: 'gitleaks', run }).run(ctx);
    expect(r.status).toBe('passed');
    expect(r.findings).toEqual([]);
  });

  it('fails on a planted secret and never records its value', async () => {
    ctx = { ...ctx, patch: LEAKY };
    const { run } = mock({ leaks: [{ RuleID: 'github-pat', StartLine: 6, Secret: FAKE_TOKEN }] });
    const r = await securityGate({ gitleaksBin: 'gitleaks', run }).run(ctx);
    expect(r.status).toBe('failed');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      ruleId: 'secret.github-pat',
      path: 'apps/demo/src/a.ts',
      line: 2,
      severity: 'critical',
    });
    expect(JSON.stringify(r)).not.toContain(FAKE_TOKEN);
  });

  it('passes --redact to gitleaks', async () => {
    const { run, calls } = mock({});
    await securityGate({ gitleaksBin: 'gitleaks', run }).run(ctx);
    expect(calls[0]).toContain('--redact');
  });

  it('is error, not pass, when gitleaks is unavailable', async () => {
    const { run } = mock({ gitleaks: { exitCode: 1, timedOut: false, output: 'not recognized' } });
    const r = await securityGate({ gitleaksBin: 'gitleaks', run }).run(ctx);
    expect(r.status).toBe('error');
  });

  it('is error when gitleaks cannot spawn', async () => {
    const { run } = mock({
      gitleaks: { exitCode: null, timedOut: false, output: '', spawnError: 'ENOENT' },
    });
    expect((await securityGate({ gitleaksBin: 'x', run }).run(ctx)).status).toBe('error');
  });

  it('is error when gitleaks claims leaks but the report lists none', async () => {
    const { run } = mock({ gitleaks: { exitCode: 2, timedOut: false, output: '' } });
    expect((await securityGate({ gitleaksBin: 'g', run }).run(ctx)).status).toBe('error');
  });

  it('fails on a high vulnerability', async () => {
    const { run } = mock({ audit: { exitCode: 1, timedOut: false, output: AUDIT_HIGH } });
    const r = await securityGate({ gitleaksBin: 'g', run }).run(ctx);
    expect(r.status).toBe('failed');
    expect(r.findings[0]).toMatchObject({ ruleId: 'audit.1234', severity: 'high' });
  });

  it('fails on a critical vulnerability found only in metadata', async () => {
    const out = JSON.stringify({ metadata: { vulnerabilities: { critical: 2 } } });
    const { run } = mock({ audit: { exitCode: 1, timedOut: false, output: out } });
    expect((await securityGate({ gitleaksBin: 'g', run }).run(ctx)).status).toBe('failed');
  });

  it('is error on a registry or network failure', async () => {
    const out = JSON.stringify({ error: { code: 'ERR_PNPM_AUDIT_BAD_RESPONSE', message: 'x' } });
    const { run } = mock({ audit: { exitCode: 1, timedOut: false, output: out } });
    expect((await securityGate({ gitleaksBin: 'g', run }).run(ctx)).status).toBe('error');
  });

  it('is error on unreadable audit output, even with exit 0', async () => {
    const { run } = mock({ audit: ok('ECONNREFUSED') });
    expect((await securityGate({ gitleaksBin: 'g', run }).run(ctx)).status).toBe('error');
  });

  it('is error when the audit times out', async () => {
    const { run } = mock({ audit: { exitCode: null, timedOut: true, output: '' } });
    expect((await securityGate({ gitleaksBin: 'g', run }).run(ctx)).status).toBe('error');
  });

  it('is error without a patch', async () => {
    const { run } = mock({});
    const r = await securityGate({ gitleaksBin: 'g', run }).run({ ...ctx, patch: null });
    expect(r.status).toBe('error');
  });

  it('is error when the app directory is missing', async () => {
    const { run } = mock({});
    const r = await securityGate({ gitleaksBin: 'g', run }).run({ ...ctx, app: 'missing' });
    expect(r.status).toBe('error');
  });

  it('a leak plus an audit error is error but keeps the secret finding', async () => {
    ctx = { ...ctx, patch: LEAKY };
    const { run } = mock({
      leaks: [{ RuleID: 'github-pat', StartLine: 6 }],
      audit: { exitCode: 1, timedOut: false, output: 'offline' },
    });
    const r = await securityGate({ gitleaksBin: 'g', run }).run(ctx);
    expect(r.status).toBe('error');
    expect(r.findings).toHaveLength(1);
  });
});

/** Optional: real gitleaks. Set LATHE_GITLEAKS to the binary path. The audit step stays mocked. */
const realBin = process.env['LATHE_GITLEAKS'];
describe.skipIf(realBin === undefined || realBin === '')('real gitleaks', () => {
  const run: CommandRunner = (spec) =>
    spec.cmd === 'pnpm' ? Promise.resolve(ok(AUDIT_CLEAN)) : runCommand(spec);

  it('catches a planted secret and reports no value', async () => {
    const r = await securityGate({ gitleaksBin: realBin as string, run }).run({
      ...ctx,
      patch: LEAKY,
    });
    expect(r.status).toBe('failed');
    expect(r.findings[0]).toMatchObject({ path: 'apps/demo/src/a.ts', line: 2 });
    expect(JSON.stringify(r)).not.toContain(FAKE_TOKEN);
  });

  it('passes a clean diff', async () => {
    const r = await securityGate({ gitleaksBin: realBin as string, run }).run(ctx);
    expect(r.status).toBe('passed');
  });
});
