import { z } from 'zod';
import { applyHunks, parseUnifiedDiff, PatchApplyError } from './diff.js';

/**
 * GitHub delivery client (task P8-01). It is the only code that holds a GitHub
 * token. Its public surface is three methods: create a branch, commit the
 * verified patch, open a DRAFT pull request. There is no merge, approve, review,
 * deploy, delete or workflow call, and an internal allow-list of endpoints
 * enforces that even for future edits of this file.
 */

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface GitHubDeliveryConfig {
  /** Fine-grained token for ONE repository: contents and pull requests only. */
  readonly token: string;
  readonly owner: string;
  readonly repo: string;
  /** Branch pull requests target. */
  readonly baseBranch: string;
  readonly apiBase?: string;
  readonly fetch?: FetchLike;
}

export type GitHubDeliveryErrorCode =
  | 'invalid_config'
  | 'invalid_input'
  | 'wrong_repository'
  | 'forbidden_endpoint'
  | 'request_failed'
  | 'bad_response'
  | 'patch_apply_failed';

export class GitHubDeliveryError extends Error {
  readonly code: GitHubDeliveryErrorCode;
  readonly status: number | undefined;
  constructor(code: GitHubDeliveryErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'GitHubDeliveryError';
    this.code = code;
    this.status = status;
  }
}

const OWNER_REPO = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/;
const BRANCH_NAME = /^[A-Za-z0-9._/-]{1,100}$/;
const SHA1 = /^[a-f0-9]{40}$/;
const RUN_ID = /^[a-f0-9-]{36}$/;
const LATHE_BRANCH = /^lathe\/[a-z0-9-]+\/[a-f0-9-]{36}$/;
const EVIDENCE_PATH = /^\.lathe\/evidence\/[a-f0-9-]{36}\/[A-Za-z0-9._-]+$/;
const FORBIDDEN_PREFIXES = ['.git/', '.github/', 'packages/verification-harness/'];
const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES = 200;

/** Every request must match one of these. Anything else is refused before it is sent. */
const ALLOWED: readonly { readonly method: string; readonly path: RegExp }[] = [
  { method: 'GET', path: /^\/contents\/[^?#]+\?ref=[a-f0-9]{40}$/ },
  { method: 'GET', path: /^\/git\/commits\/[a-f0-9]{40}$/ },
  { method: 'POST', path: /^\/git\/refs$/ },
  { method: 'POST', path: /^\/git\/blobs$/ },
  { method: 'POST', path: /^\/git\/trees$/ },
  { method: 'POST', path: /^\/git\/commits$/ },
  { method: 'PATCH', path: /^\/git\/refs\/heads\/lathe\/[a-z0-9-]+\/[a-f0-9-]{36}$/ },
  { method: 'POST', path: /^\/pulls$/ },
];

const ShaObject = z.object({ sha: z.string().regex(SHA1) });
const CommitResponse = z.object({ sha: z.string().regex(SHA1), tree: ShaObject });
const PullResponse = z.object({
  number: z.number().int().min(1),
  html_url: z.url(),
  draft: z.boolean(),
});

export interface CreateDeliveryBranchInput {
  /** Human-readable project name or run title. Reduced to a safe slug. */
  readonly project: string;
  readonly runId: string;
  readonly baseCommit: string;
  readonly repository?: string;
}
export interface CommitPatchInput {
  readonly branch: string;
  readonly baseCommit: string;
  /** The verified unified diff, as stored by the build step. */
  readonly diff: string;
  readonly message: string;
  /** Extra files, only under `.lathe/evidence/<runId>/`. */
  readonly evidenceFiles?: readonly { readonly path: string; readonly content: string }[];
  readonly repository?: string;
}
export interface OpenDraftPullRequestInput {
  readonly branch: string;
  readonly title: string;
  readonly body: string;
  readonly repository?: string;
}

/** `lathe/<slug>/<runId>`, the shape contract C4 and the CI verify workflow expect. */
export function deliveryBranchName(project: string, runId: string): string {
  if (!RUN_ID.test(runId)) throw new GitHubDeliveryError('invalid_input', 'invalid run id');
  const slug =
    project
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'run';
  return `lathe/${slug}/${runId}`;
}

export class GitHubDeliveryClient {
  readonly #token: string;
  readonly #owner: string;
  readonly #repo: string;
  readonly #baseBranch: string;
  readonly #apiBase: string;
  readonly #fetch: FetchLike;

  constructor(config: GitHubDeliveryConfig) {
    if (config.token.length === 0)
      throw new GitHubDeliveryError('invalid_config', 'a GitHub token is required');
    if (!OWNER_REPO.test(config.owner) || !OWNER_REPO.test(config.repo))
      throw new GitHubDeliveryError('invalid_config', 'invalid repository owner or name');
    if (!BRANCH_NAME.test(config.baseBranch) || config.baseBranch.includes('..'))
      throw new GitHubDeliveryError('invalid_config', 'invalid base branch');
    this.#token = config.token;
    this.#owner = config.owner;
    this.#repo = config.repo;
    this.#baseBranch = config.baseBranch;
    this.#apiBase = (config.apiBase ?? 'https://api.github.com').replace(/\/+$/, '');
    this.#fetch = config.fetch ?? ((url, init) => fetch(url, init));
  }

  /** Never serialise the token: JSON.stringify and console.log show nothing secret. */
  toJSON(): { repository: string } {
    return { repository: `${this.#owner}/${this.#repo}` };
  }

  async createDeliveryBranch(input: CreateDeliveryBranchInput): Promise<{ branch: string }> {
    this.#assertRepository(input.repository);
    if (!SHA1.test(input.baseCommit))
      throw new GitHubDeliveryError('invalid_input', 'invalid base commit');
    const branch = deliveryBranchName(input.project, input.runId);
    await this.#send('create branch', 'POST', '/git/refs', {
      ref: `refs/heads/${branch}`,
      sha: input.baseCommit,
    });
    return { branch };
  }

  async commitPatch(input: CommitPatchInput): Promise<{ commitSha: string }> {
    this.#assertRepository(input.repository);
    if (!LATHE_BRANCH.test(input.branch))
      throw new GitHubDeliveryError('invalid_input', 'invalid delivery branch');
    if (!SHA1.test(input.baseCommit))
      throw new GitHubDeliveryError('invalid_input', 'invalid base commit');
    if (input.message.length === 0 || input.message.length > 5_000)
      throw new GitHubDeliveryError('invalid_input', 'invalid commit message');

    let files;
    try {
      files = parseUnifiedDiff(input.diff);
    } catch (cause) {
      throw new GitHubDeliveryError('patch_apply_failed', this.#scrub(describe(cause)));
    }
    const evidence = input.evidenceFiles ?? [];
    if (files.length + evidence.length > MAX_FILES)
      throw new GitHubDeliveryError('invalid_input', 'too many files');
    for (const f of files) this.#assertPath(f.path);
    for (const e of evidence)
      if (!EVIDENCE_PATH.test(e.path))
        throw new GitHubDeliveryError('invalid_input', 'evidence files must be under .lathe/');

    const commit = CommitResponse.safeParse(
      await this.#send('read base commit', 'GET', `/git/commits/${input.baseCommit}`),
    );
    if (!commit.success) throw badResponse('read base commit');

    const entries: { path: string; mode: string; type: 'blob'; sha: string | null }[] = [];
    for (const file of files) {
      if (file.kind === 'delete') {
        entries.push({ path: file.path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      let base = '';
      if (file.kind === 'modify') {
        base = await this.#sendText(
          'read base file',
          `/contents/${encodePath(file.path)}?ref=${input.baseCommit}`,
        );
      }
      let content: string;
      try {
        content = applyHunks(base, file.hunks);
      } catch (cause) {
        throw new GitHubDeliveryError('patch_apply_failed', this.#scrub(describe(cause)));
      }
      entries.push({
        path: file.path,
        mode: file.executable ? '100755' : '100644',
        type: 'blob',
        sha: await this.#blob(content),
      });
    }
    for (const e of evidence)
      entries.push({
        path: e.path,
        mode: '100644',
        type: 'blob',
        sha: await this.#blob(e.content),
      });

    const tree = ShaObject.safeParse(
      await this.#send('create tree', 'POST', '/git/trees', {
        base_tree: commit.data.tree.sha,
        tree: entries,
      }),
    );
    if (!tree.success) throw badResponse('create tree');
    const created = ShaObject.safeParse(
      await this.#send('create commit', 'POST', '/git/commits', {
        message: input.message,
        tree: tree.data.sha,
        parents: [input.baseCommit],
      }),
    );
    if (!created.success) throw badResponse('create commit');
    // Not forced: a branch that moved since creation is an error, not overwritten.
    await this.#send('update branch', 'PATCH', `/git/refs/heads/${input.branch}`, {
      sha: created.data.sha,
      force: false,
    });
    return { commitSha: created.data.sha };
  }

  async openDraftPullRequest(
    input: OpenDraftPullRequestInput,
  ): Promise<{ number: number; url: string }> {
    this.#assertRepository(input.repository);
    if (!LATHE_BRANCH.test(input.branch))
      throw new GitHubDeliveryError('invalid_input', 'invalid delivery branch');
    if (input.title.length === 0 || input.title.length > 256)
      throw new GitHubDeliveryError('invalid_input', 'invalid title');
    const pr = PullResponse.safeParse(
      await this.#send('open pull request', 'POST', '/pulls', {
        title: input.title,
        head: input.branch,
        base: this.#baseBranch,
        body: input.body,
        draft: true,
      }),
    );
    // A non-draft answer must never be treated as delivered.
    if (!pr.success || !pr.data.draft) throw badResponse('open pull request');
    return { number: pr.data.number, url: pr.data.html_url };
  }

  async #blob(content: string): Promise<string> {
    const bytes = Buffer.from(content, 'utf8');
    if (bytes.length > MAX_FILE_BYTES)
      throw new GitHubDeliveryError('invalid_input', 'file too large');
    const blob = ShaObject.safeParse(
      await this.#send('create blob', 'POST', '/git/blobs', {
        content: bytes.toString('base64'),
        encoding: 'base64',
      }),
    );
    if (!blob.success) throw badResponse('create blob');
    return blob.data.sha;
  }

  #assertRepository(repository: string | undefined): void {
    if (repository !== undefined && repository !== `${this.#owner}/${this.#repo}`)
      throw new GitHubDeliveryError('wrong_repository', 'repository is not the configured one');
  }

  #assertPath(path: string): void {
    const bad =
      path.startsWith('/') ||
      path.split('/').some((s) => s === '' || s === '.' || s === '..') ||
      path.includes('\\') ||
      FORBIDDEN_PREFIXES.some((p) => path.startsWith(p));
    if (bad) throw new GitHubDeliveryError('invalid_input', 'patch path is not allowed');
  }

  #scrub(text: string): string {
    return text.split(this.#token).join('[REDACTED]');
  }

  async #raw(
    operation: string,
    method: string,
    path: string,
    body: unknown,
    accept: string,
  ): Promise<Response> {
    if (!ALLOWED.some((a) => a.method === method && a.path.test(path)))
      throw new GitHubDeliveryError('forbidden_endpoint', `${operation}: endpoint not allowed`);
    const url = `${this.#apiBase}/repos/${this.#owner}/${this.#repo}${path}`;
    const init: RequestInit = {
      method,
      redirect: 'error',
      headers: {
        authorization: `Bearer ${this.#token}`,
        accept,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'lathe-factory-engine',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    let response: Response;
    try {
      response = await this.#fetch(url, init);
    } catch (cause) {
      // The cause may echo request details; keep only its name.
      const name = cause instanceof Error ? cause.name : 'unknown error';
      throw new GitHubDeliveryError('request_failed', `${operation} failed: ${this.#scrub(name)}`);
    }
    if (!response.ok)
      throw new GitHubDeliveryError(
        'request_failed',
        `${operation} failed (HTTP ${String(response.status)})`,
        response.status,
      );
    return response;
  }

  async #send(operation: string, method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await this.#raw(operation, method, path, body, 'application/vnd.github+json');
    try {
      return await response.json();
    } catch {
      throw badResponse(operation);
    }
  }

  async #sendText(operation: string, path: string): Promise<string> {
    const response = await this.#raw(
      operation,
      'GET',
      path,
      undefined,
      'application/vnd.github.raw+json',
    );
    return response.text();
  }
}

function badResponse(operation: string): GitHubDeliveryError {
  return new GitHubDeliveryError('bad_response', `${operation}: unexpected response`);
}
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
function describe(cause: unknown): string {
  return cause instanceof PatchApplyError ? cause.message : 'patch could not be read';
}
