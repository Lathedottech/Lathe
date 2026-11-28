// CI verify step (task P8-02): runs the trusted `lathe-verify` on a Lathe draft PR, as a
// second check independent of the Engine's own verifier.
//
// Trust model:
//   - this script and the harness come from the BASE commit (checked out in `--trusted`),
//     never from the PR, so a PR cannot change what verifies it;
//   - the PR head is only data: `--worktree` and the patch `git diff <merge-base> HEAD`;
//   - nothing from the PR is installed or executed here.
// Only Node built-ins are used, so it runs before any dependency of the PR is installed.
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Branch name of an Engine delivery: `lathe/<project>/<run-id>` (contract C4 `Delivery.branch`). */
export const LATHE_BRANCH = /^lathe\/[a-z0-9-]+\/[a-f0-9-]{36}$/;
const SLUG = /^[a-z][a-z0-9-]{0,62}$/;
const SHA = /^[0-9a-f]{40}$/;
/** Not a target app: the Lathe operator UI itself is never built by an agent. */
const NOT_TARGETS = new Set(['workspace']);

export const isLatheBranch = (ref) => typeof ref === 'string' && LATHE_BRANCH.test(ref);

/**
 * The one app a Lathe patch may change. Every changed file must be under `apps/<app>/`
 * for the same `<app>`; anything else is an error (a bounded module lives in one app).
 * Returns `{ app }` or `{ error }`.
 */
export function selectApp(files) {
  if (files.length === 0) return { error: 'the PR changes no files' };
  const apps = new Set();
  const outside = [];
  for (const f of files) {
    const m = /^apps\/([^/]+)\/./.exec(f);
    if (!m || f.split('/').includes('..')) outside.push(f);
    else apps.add(m[1]);
  }
  if (outside.length > 0)
    return { error: `changes outside apps/<app>/: ${outside.slice(0, 5).join(', ')}` };
  if (apps.size !== 1) return { error: `changes span ${apps.size} apps: ${[...apps].join(', ')}` };
  const [app] = apps;
  if (!SLUG.test(app) || NOT_TARGETS.has(app)) return { error: `${app} is not a target app` };
  return { app };
}

function git(cwd, args) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr ?? '').trim()}`);
  return r.stdout;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    if (!k?.startsWith('--') || v === undefined) throw new Error(`bad argument ${k ?? ''}`);
    out[k.slice(2)] = v;
  }
  for (const k of ['trusted', 'pr', 'base', 'head', 'ref', 'out'])
    if (!out[k]) throw new Error(`missing --${k}`);
  if (!SHA.test(out.base) || !SHA.test(out.head))
    throw new Error('--base and --head must be full SHAs');
  return out;
}

/** Writes a line to the job summary (if any) and to stdout. */
function summary(lines) {
  const text = `${lines.join('\n')}\n`;
  process.stdout.write(text);
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) writeFileSync(file, text, { flag: 'a' });
}

export function main(argv) {
  const args = parseArgs(argv);
  if (!isLatheBranch(args.ref)) {
    summary([`Not a Lathe delivery branch (\`${args.ref.slice(0, 100)}\`): nothing to verify.`]);
    return 0;
  }
  const pr = resolve(args.pr);
  const head = git(pr, ['rev-parse', 'HEAD']).trim();
  if (head !== args.head) throw new Error(`PR checkout is at ${head}, expected ${args.head}`);
  const mergeBase = git(pr, ['merge-base', args.base, 'HEAD']).trim();
  const files = git(pr, ['diff', '--name-only', '-z', '--no-renames', mergeBase, 'HEAD'])
    .split('\0')
    .filter(Boolean);
  const picked = selectApp(files);
  if ('error' in picked) {
    summary(['## lathe-verify: error', '', picked.error]);
    return 2;
  }
  const patch = git(pr, [
    'diff',
    '--binary',
    '--full-index',
    '--no-renames',
    '--no-ext-diff',
    '--no-textconv',
    mergeBase,
    'HEAD',
  ]);
  const out = resolve(args.out);
  mkdirSync(out, { recursive: true });
  const patchFile = join(out, 'pr.patch');
  const reportFile = join(out, 'report.json');
  writeFileSync(patchFile, patch, 'utf8');

  const bin = join(resolve(args.trusted), 'packages/verification-harness/bin/lathe-verify.mjs');
  const r = spawnSync(
    process.execPath,
    [
      bin,
      picked.app,
      '--worktree',
      pr,
      '--commit',
      head,
      '--report',
      reportFile,
      '--patch',
      patchFile,
    ],
    { cwd: resolve(args.trusted), encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] },
  );
  const code = r.status ?? 2;
  summary([
    `## lathe-verify: exit ${code} (${code === 0 ? 'passed' : code === 1 ? 'failed' : 'error'})`,
    '',
    `- app: \`${picked.app}\``,
    `- commit: \`${head}\``,
    `- harness from base: \`${args.base}\``,
    `- files in patch: ${files.length}`,
  ]);
  return code === 0 || code === 1 ? code : 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`verify-pr: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
