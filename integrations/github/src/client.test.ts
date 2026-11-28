import { describe, expect, it } from 'vitest';
import {
  GitHubDeliveryClient,
  GitHubDeliveryError,
  deliveryBranchName,
  type FetchLike,
} from './index.js';
import { applyHunks, parseUnifiedDiff } from './diff.js';

const TOKEN = 'github_pat_TESTTOKEN_0123456789abcdef';
const RUN = '11111111-1111-4111-8111-111111111111';
const BASE = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const NEWCOMMIT = 'c'.repeat(40);

interface Seen {
  method: string;
  url: string;
  body: Record<string, unknown> | undefined;
  headers: Record<string, string>;
}

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function fakeGitHub(options: { failAt?: string; failStatus?: number; draft?: boolean } = {}) {
  const seen: Seen[] = [];
  let n = 0;
  const fetchImpl: FetchLike = (url, init) => {
    const body =
      typeof init.body === 'string' ? (JSON.parse(init.body) as Seen['body']) : undefined;
    const path = new URL(url).pathname.replace('/repos/acme/lathe-demo', '');
    seen.push({
      method: init.method ?? 'GET',
      url,
      body,
      headers: init.headers as Record<string, string>,
    });
    const key = `${init.method ?? 'GET'} ${path}`;
    if (options.failAt !== undefined && key.startsWith(options.failAt))
      return Promise.resolve(
        new Response(`secret echo ${TOKEN}`, { status: options.failStatus ?? 500 }),
      );
    if (key.startsWith('GET /contents/')) return Promise.resolve(new Response('line1\nline2\n'));
    if (key.startsWith('GET /git/commits/'))
      return Promise.resolve(json({ sha: BASE, tree: { sha: TREE } }));
    if (key === 'POST /git/refs') return Promise.resolve(json({ ref: 'x' }, 201));
    if (key === 'POST /git/blobs')
      return Promise.resolve(json({ sha: String(++n).padStart(40, 'd') }, 201));
    if (key === 'POST /git/trees') return Promise.resolve(json({ sha: 'e'.repeat(40) }, 201));
    if (key === 'POST /git/commits') return Promise.resolve(json({ sha: NEWCOMMIT }, 201));
    if (key.startsWith('PATCH /git/refs/heads/')) return Promise.resolve(json({ ref: 'x' }));
    if (key === 'POST /pulls')
      return Promise.resolve(
        json(
          {
            number: 7,
            html_url: 'https://github.com/acme/lathe-demo/pull/7',
            draft: options.draft ?? true,
          },
          201,
        ),
      );
    return Promise.resolve(new Response('unexpected', { status: 418 }));
  };
  const client = new GitHubDeliveryClient({
    token: TOKEN,
    owner: 'acme',
    repo: 'lathe-demo',
    baseBranch: 'main',
    fetch: fetchImpl,
  });
  return { client, seen };
}

const DIFF = [
  'diff --git a/apps/support-desk/src/kb/a.ts b/apps/support-desk/src/kb/a.ts',
  'index 1111111..2222222 100644',
  '--- a/apps/support-desk/src/kb/a.ts',
  '+++ b/apps/support-desk/src/kb/a.ts',
  '@@ -1,2 +1,3 @@',
  ' line1',
  '+inserted',
  ' line2',
  'diff --git a/apps/support-desk/src/kb/b.ts b/apps/support-desk/src/kb/b.ts',
  'new file mode 100644',
  'index 0000000..3333333',
  '--- /dev/null',
  '+++ b/apps/support-desk/src/kb/b.ts',
  '@@ -0,0 +1 @@',
  '+export const b = 1;',
  '',
].join('\n');

const BRANCH = `lathe/knowledge-base/${RUN}`;

describe('deliveryBranchName', () => {
  it('matches the CI verify branch pattern', () => {
    const name = deliveryBranchName('Knowledge Base!! (KB)', RUN);
    expect(name).toBe(`lathe/knowledge-base-kb/${RUN}`);
    expect(name).toMatch(/^lathe\/[a-z0-9-]+\/[a-f0-9-]{36}$/);
    expect(deliveryBranchName('***', RUN)).toBe(`lathe/run/${RUN}`);
  });
  it('rejects a run id that is not a uuid shape', () => {
    expect(() => deliveryBranchName('x', '../../main')).toThrow(GitHubDeliveryError);
  });
});

describe('GitHubDeliveryClient', () => {
  it('exposes exactly three delivery operations and no merge, review or delete', () => {
    const { client } = fakeGitHub();
    const names = new Set<string>();
    for (let o: object | null = client; o && o !== Object.prototype; o = Object.getPrototypeOf(o))
      for (const k of Object.getOwnPropertyNames(o)) names.add(k);
    const publicNames = [...names].filter((k) => k !== 'constructor' && k !== 'toJSON').sort();
    expect(publicNames).toEqual(['commitPatch', 'createDeliveryBranch', 'openDraftPullRequest']);
  });

  it('creates the branch from the base commit', async () => {
    const { client, seen } = fakeGitHub();
    const r = await client.createDeliveryBranch({
      project: 'Knowledge Base',
      runId: RUN,
      baseCommit: BASE,
    });
    expect(r.branch).toBe(BRANCH);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.url).toBe('https://api.github.com/repos/acme/lathe-demo/git/refs');
    expect(seen[0]?.body).toEqual({ ref: `refs/heads/${BRANCH}`, sha: BASE });
  });

  it('commits the patch through the Git Data API in order, without force', async () => {
    const { client, seen } = fakeGitHub();
    const r = await client.commitPatch({
      branch: BRANCH,
      baseCommit: BASE,
      diff: DIFF,
      message: 'feat: kb',
      evidenceFiles: [{ path: `.lathe/evidence/${RUN}/summary.json`, content: '{}' }],
    });
    expect(r.commitSha).toBe(NEWCOMMIT);
    expect(
      seen.map((s) => `${s.method} ${new URL(s.url).pathname.split('lathe-demo')[1]}`),
    ).toEqual(
      [
        `GET /git/commits/${BASE}`,
        'GET /contents/apps/support-desk/src/kb/a.ts?ref=' + BASE,
        'POST /git/blobs',
        'POST /git/blobs',
        'POST /git/blobs',
        'POST /git/trees',
        'POST /git/commits',
        `PATCH /git/refs/heads/${BRANCH}`,
      ].map((s) => s.split('?')[0] ?? s),
    );
    const blob = seen.find((s) => s.url.endsWith('/git/blobs'));
    expect(Buffer.from(String(blob?.body?.['content']), 'base64').toString()).toBe(
      'line1\ninserted\nline2\n',
    );
    const commit = seen.find((s) => s.url.endsWith('/git/commits') && s.method === 'POST');
    expect(commit?.body?.['parents']).toEqual([BASE]);
    expect(seen[seen.length - 1]?.body?.['force']).toBe(false);
  });

  it('opens a draft pull request against the configured base branch', async () => {
    const { client, seen } = fakeGitHub();
    const pr = await client.openDraftPullRequest({ branch: BRANCH, title: 't', body: 'b' });
    expect(pr).toEqual({ number: 7, url: 'https://github.com/acme/lathe-demo/pull/7' });
    expect(seen[0]?.body).toMatchObject({ draft: true, head: BRANCH, base: 'main' });
  });

  it('does not treat a non-draft answer as success', async () => {
    const { client } = fakeGitHub({ draft: false });
    await expect(
      client.openDraftPullRequest({ branch: BRANCH, title: 't', body: 'b' }),
    ).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('refuses any repository other than the configured one, with no request sent', async () => {
    const { client, seen } = fakeGitHub();
    await expect(
      client.openDraftPullRequest({
        branch: BRANCH,
        title: 't',
        body: 'b',
        repository: 'evil/other',
      }),
    ).rejects.toMatchObject({ code: 'wrong_repository' });
    await expect(
      client.createDeliveryBranch({
        project: 'x',
        runId: RUN,
        baseCommit: BASE,
        repository: 'acme/other',
      }),
    ).rejects.toMatchObject({ code: 'wrong_repository' });
    expect(seen).toHaveLength(0);
  });

  it('rejects an owner or repo that could redirect requests', () => {
    for (const [owner, repo] of [
      ['acme/x', 'r'],
      ['acme', '../other'],
      ['', 'r'],
    ] as const)
      expect(
        () => new GitHubDeliveryClient({ token: TOKEN, owner, repo, baseBranch: 'main' }),
      ).toThrow(GitHubDeliveryError);
  });

  it('never sends a request to a merge, review, delete or workflow endpoint', async () => {
    const { client, seen } = fakeGitHub();
    await client.createDeliveryBranch({ project: 'kb', runId: RUN, baseCommit: BASE });
    await client.commitPatch({ branch: BRANCH, baseCommit: BASE, diff: DIFF, message: 'm' });
    await client.openDraftPullRequest({ branch: BRANCH, title: 't', body: 'b' });
    for (const s of seen) {
      expect(s.method).not.toBe('DELETE');
      expect(s.method).not.toBe('PUT');
      expect(s.url).not.toMatch(/\/(merge|reviews|actions|workflows|dispatches|deployments)\b/);
    }
  });

  it('refuses patches that touch .github, the harness or escape the tree', async () => {
    const { client, seen } = fakeGitHub();
    for (const path of [
      '.github/workflows/ci.yml',
      'packages/verification-harness/x.ts',
      'a/../b',
    ]) {
      const diff = `diff --git a/${path} b/${path}\nnew file mode 100644\nindex 0000000..1\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+x\n`;
      await expect(
        client.commitPatch({ branch: BRANCH, baseCommit: BASE, diff, message: 'm' }),
      ).rejects.toMatchObject({ code: 'invalid_input' });
    }
    expect(seen.filter((s) => s.method !== 'GET')).toHaveLength(0);
  });

  it('refuses binary patches, renames and evidence files outside .lathe', async () => {
    const { client } = fakeGitHub();
    const binary = 'diff --git a/x.png b/x.png\nBinary files a/x.png and b/x.png differ\n';
    await expect(
      client.commitPatch({ branch: BRANCH, baseCommit: BASE, diff: binary, message: 'm' }),
    ).rejects.toMatchObject({ code: 'patch_apply_failed' });
    await expect(
      client.commitPatch({
        branch: BRANCH,
        baseCommit: BASE,
        diff: DIFF,
        message: 'm',
        evidenceFiles: [{ path: 'src/evil.ts', content: 'x' }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('keeps the token out of errors, for HTTP failures and network failures', async () => {
    const failing = fakeGitHub({ failAt: 'POST /git/refs', failStatus: 403 });
    const e1 = await failing.client
      .createDeliveryBranch({ project: 'kb', runId: RUN, baseCommit: BASE })
      .catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(GitHubDeliveryError);
    expect((e1 as GitHubDeliveryError).status).toBe(403);
    expect(
      JSON.stringify(e1) + String((e1 as Error).message) + String((e1 as Error).stack),
    ).not.toContain(TOKEN);

    const net = new GitHubDeliveryClient({
      token: TOKEN,
      owner: 'acme',
      repo: 'lathe-demo',
      baseBranch: 'main',
      fetch: () => Promise.reject(new Error(`connect failed with ${TOKEN}`)),
    });
    const e2 = await net
      .openDraftPullRequest({ branch: BRANCH, title: 't', body: 'b' })
      .catch((e: unknown) => e);
    expect(String((e2 as Error).message)).not.toContain(TOKEN);
    expect(JSON.stringify(net)).not.toContain(TOKEN);
  });

  it('sends the token only as a bearer header', async () => {
    const { client, seen } = fakeGitHub();
    await client.openDraftPullRequest({ branch: BRANCH, title: 't', body: 'b' });
    expect(seen[0]?.headers['authorization']).toBe(`Bearer ${TOKEN}`);
    expect(seen[0]?.url).not.toContain(TOKEN);
    expect(JSON.stringify(seen[0]?.body)).not.toContain(TOKEN);
  });
});

describe('unified diff', () => {
  it('applies modify, add and delete hunks', () => {
    const files = parseUnifiedDiff(DIFF);
    expect(files.map((f) => [f.path, f.kind])).toEqual([
      ['apps/support-desk/src/kb/a.ts', 'modify'],
      ['apps/support-desk/src/kb/b.ts', 'add'],
    ]);
    expect(applyHunks('line1\nline2\n', files[0]?.hunks ?? [])).toBe('line1\ninserted\nline2\n');
    expect(applyHunks('', files[1]?.hunks ?? [])).toBe('export const b = 1;\n');
  });

  it('handles the no-newline marker', () => {
    const d =
      'diff --git a/f b/f\nindex 1..2 100644\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n';
    const f = parseUnifiedDiff(d)[0];
    expect(applyHunks('old', f?.hunks ?? [])).toBe('new\n');
  });

  it('fails when the context does not match the base', () => {
    const f = parseUnifiedDiff(DIFF)[0];
    expect(() => applyHunks('other\ncontent\n', f?.hunks ?? [])).toThrow();
  });
});
