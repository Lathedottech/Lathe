// Tests of the CI verify step (task P8-02), against real git and the real `lathe-verify`.
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isLatheBranch, main, selectApp } from './verify-pr.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const RUN = '3f0c5c1e-6b2a-4c1e-8a4b-1d2e3f405162';

describe('isLatheBranch', () => {
  it.each([`lathe/support-desk/${RUN}`, `lathe/kb/${RUN}`])('accepts %s', (b) => {
    expect(isLatheBranch(b)).toBe(true);
  });
  it.each([
    'main',
    'task/P8-02-ci-verify',
    `lathe/${RUN}`,
    `lathe/Support/${RUN}`,
    `xlathe/a/${RUN}`,
    undefined,
  ])('rejects %s', (b) => {
    expect(isLatheBranch(b)).toBe(false);
  });
});

describe('selectApp', () => {
  it('picks the single app all changes are in', () => {
    expect(
      selectApp(['apps/support-desk/src/kb/a.ts', 'apps/support-desk/migrations/x.sql']),
    ).toEqual({
      app: 'support-desk',
    });
  });
  it.each([
    [[], /no files/],
    [['apps/support-desk/a.ts', 'apps/team-operations/b.ts'], /span 2 apps/],
    [['apps/support-desk/a.ts', 'packages/application-foundation/x.ts'], /outside apps/],
    [['.github/workflows/verify.yml'], /outside apps/],
    [['packages/verification-harness/src/runner.ts'], /outside apps/],
    [['apps/support-desk/../x.ts'], /outside apps/],
    [['apps/workspace/src/app/page.tsx'], /not a target app/],
    [['apps/Bad_Name/a.ts'], /not a target app/],
  ])('rejects %j', (files, message) => {
    const r = selectApp(files);
    expect('error' in r && r.error).toMatch(message);
  });
});

/**
 * A throwaway repository: base commit with apps/support-desk, then a PR commit on top.
 * lathe-verify takes POSIX worktree paths only (contract C3 `VerifyRequest.worktree`): it runs in
 * Linux CI and containers. These tests run in CI (ubuntu) and in a Linux container locally; on
 * Windows they are skipped, never passed.
 */
describe.skipIf(process.platform === 'win32')(
  'main, with real git and the trusted lathe-verify',
  () => {
    let dir;
    let base;
    const g = (args) => {
      const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(r.stderr);
      return r.stdout.trim();
    };
    const commit = async (path, text) => {
      await mkdir(join(dir, path, '..'), { recursive: true });
      await writeFile(join(dir, path), text);
      g(['add', '-A']);
      g(['-c', 'user.email=ci@lathe.test', '-c', 'user.name=ci', 'commit', '-q', '-m', path]);
      return g(['rev-parse', 'HEAD']);
    };
    const run = async (head, ref) => {
      const out = join(dir, '..', `out-${head.slice(0, 7)}`);
      const code = main([
        '--trusted',
        repoRoot,
        '--pr',
        dir,
        '--base',
        base,
        '--head',
        head,
        '--ref',
        ref,
        '--out',
        out,
      ]);
      const report = await readFile(join(out, 'report.json'), 'utf8').then(JSON.parse, () => null);
      return { code, report };
    };

    beforeAll(async () => {
      const root = await mkdtemp(join(tmpdir(), 'lathe-verify-pr-'));
      dir = join(root, 'repo');
      await mkdir(dir);
      g(['init', '-q', '-b', 'main']);
      base = await commit('apps/support-desk/src/index.ts', 'export const a = 1;\n');
    });
    afterAll(async () => {
      await rm(join(dir, '..'), { recursive: true, force: true });
    });

    it('skips a branch that is not a Lathe delivery, without running anything', async () => {
      g(['checkout', '-q', '-b', 'feature']);
      const head = await commit('apps/support-desk/src/b.ts', 'export const b = 2;\n');
      const { code, report } = await run(head, 'feature');
      expect(code).toBe(0);
      expect(report).toBeNull();
    });

    it('a change outside the app is an error before any gate runs (exit 2)', async () => {
      g(['checkout', '-q', base]);
      g(['checkout', '-q', '-b', 'harness-edit']);
      const head = await commit('packages/verification-harness/src/runner.ts', 'export {};\n');
      const { code, report } = await run(head, `lathe/support-desk/${RUN}`);
      expect(code).toBe(2);
      expect(report).toBeNull();
    });

    it('a symlink inside the app pointing at the harness fails the protected-path gate (exit 1)', async () => {
      g(['checkout', '-q', base]);
      g(['checkout', '-q', '-b', 'symlink']);
      const blob = spawnSync('git', ['hash-object', '-w', '--stdin'], {
        cwd: dir,
        input: '../../packages/verification-harness',
        encoding: 'utf8',
      }).stdout.trim();
      g(['update-index', '--add', '--cacheinfo', `120000,${blob},apps/support-desk/harness`]);
      g(['-c', 'user.email=ci@lathe.test', '-c', 'user.name=ci', 'commit', '-q', '-m', 'symlink']);
      const head = g(['rev-parse', 'HEAD']);
      const { code, report } = await run(head, `lathe/support-desk/${RUN}`);
      expect(report.gates[0]).toMatchObject({ gate: 'protected-paths', status: 'failed' });
      expect(report.overall).toBe('failed');
      expect(code).toBe(1);
    });
    it('runs the trusted lathe-verify on a Lathe PR and returns its result', async () => {
      g(['checkout', '-q', base]);
      g(['checkout', '-q', '-b', 'lathe-ok']);
      const head = await commit('apps/support-desk/src/kb.ts', 'export const kb = true;\n');
      const { code, report } = await run(head, `lathe/support-desk/${RUN}`);
      expect(report).not.toBeNull();
      expect(report.app).toBe('support-desk');
      expect(report.commit).toBe(head);
      expect(report.gates[0]).toMatchObject({ gate: 'protected-paths', status: 'passed' });
      // Gates after protected-paths are not on main yet (P2-03..P2-07): the result is `error`,
      // and the step must fail rather than pass.
      expect([1, 2]).toContain(code);
      expect(code).toBe({ passed: 0, failed: 1, error: 2 }[report.overall]);
    });

    it('refuses a checkout that is not at the PR head', async () => {
      expect(() =>
        main([
          '--trusted',
          repoRoot,
          '--pr',
          dir,
          '--base',
          base,
          '--head',
          base,
          '--ref',
          `lathe/a/${RUN}`,
          '--out',
          dir,
        ]),
      ).toThrow(/expected/);
    });
  },
);
