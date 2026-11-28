import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeCommandRunner, pickDockerEnv, type CommandRunner } from './docker-sandbox.js';
import { SandboxError } from './errors.js';
import { Worktree, createGitRunner, removeDir } from './worktree.js';

const fwd = (p: string): string => p.split(path.sep).join('/');
const saved = process.env.GIT_CONFIG_GLOBAL;

function definedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  );
}
/** A runner whose env also carries the host environment, as a careless runner would. */
const leakyRunner: CommandRunner = {
  run: (c, a, o) => nodeCommandRunner.run(c, a, { ...o, env: { ...definedEnv(), ...(o?.env ?? {}) } }),
};

let work: string;
let repo: string;
let marker: string;
let sha: string;

/** Plain git for fixture setup only (not the code under test). */
async function setupGit(args: string[], cwd: string): Promise<string> {
  const r = await nodeCommandRunner.run('git', args, {
    cwd,
    env: {
      ...pickDockerEnv(process.env),
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
      GIT_CONFIG_GLOBAL: path.join(work, 'none'),
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
  if (r.code !== 0) throw new Error(`git ${args[0] ?? ''}: ${r.stderr}`);
  return r.stdout;
}

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), 'lathe-f36-'));
  repo = path.join(work, 'repo');
  marker = path.join(work, 'PWNED');
  for (const [f, c] of Object.entries({
    'apps/demo/src/a.ts': 'export const a = 1;\n',
    'packages/application-foundation/index.ts': 'export {};\n',
    'packages/verification-harness/gate.ts': 'gate\n',
  })) {
    await mkdir(path.dirname(path.join(repo, f)), { recursive: true });
    await writeFile(path.join(repo, f), c);
  }
  await setupGit(['init', '-q', '-b', 'main'], repo);
  await setupGit(['add', '-A'], repo);
  await setupGit(['commit', '-q', '-m', 'base'], repo);
  sha = (await setupGit(['rev-parse', 'HEAD'], repo)).trim();
});
afterEach(async () => {
  if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL;
  else process.env.GIT_CONFIG_GLOBAL = saved;
  await removeDir(work, nodeCommandRunner);
}, 60_000);

describe('Worktree git calls ignore the host git configuration', () => {
  it('rejects an agent .gitattributes and never runs a host clean filter', async () => {
    const script = path.join(work, 'filter.cjs');
    await writeFile(
      script,
      `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'); process.stdin.pipe(process.stdout);`,
    );
    const hostConfig = path.join(work, 'host.gitconfig');
    await writeFile(
      hostConfig,
      `[filter "x"]\n\tclean = node ${fwd(script)}\n\tsmudge = cat\n`,
    );
    process.env.GIT_CONFIG_GLOBAL = hostConfig;

    const git = createGitRunner(leakyRunner, pickDockerEnv(process.env));
    const wtRoot = path.join(work, 'wts');
    await mkdir(wtRoot);
    const wt = await Worktree.create(
      { repoDir: repo, git, commands: nodeCommandRunner, tempRoot: wtRoot },
      { targetApp: 'demo', baseCommit: sha },
    );
    try {
      const app = path.join(wt.dir, 'apps', 'demo');
      await writeFile(path.join(app, '.gitattributes'), '* filter=x\n');
      await writeFile(path.join(app, 'src', 'a.ts'), 'export const a = 2;\n');
      const e: unknown = await wt.collectPatch().then(
        () => undefined,
        (x: unknown) => x,
      );
      expect(e).toBeInstanceOf(SandboxError);
      expect((e as SandboxError).code).toBe('unsafe_git_metadata');
      expect(existsSync(marker)).toBe(false);
    } finally {
      await wt.destroy();
    }
  }, 120_000);
});
