/**
 * Tenant isolation suite (task P2-04), driven only by the C1 tenant contract.
 *
 * For every tenant table the suite signs in as a principal of org a, creates a row through the
 * contract's create action, then signs in as principals of org b and tries to read, list, guess,
 * update and delete it. Every cross-org access must look exactly like "does not exist" (404).
 *
 * Request conventions the suite relies on (not expressed by C1 v1, see the P2-04 report):
 *   - sign-in: POST `session.signIn` with JSON `{ email, password }`; the session is the cookies set;
 *   - create: JSON `{ label }`, answer JSON with `id` (and `org_id` when the table exposes it);
 *   - update: JSON `{ label }`; list answers 2xx; a foreign or missing row answers 404.
 *
 * Findings never contain the password or response bodies, only rule ids, routes and statuses.
 */
import type { Finding, Principal, TenantAction, TenantContract } from '@lathe/shared-contracts';

export interface TenantIsolationOptions {
  readonly contract: TenantContract;
  /** Origin of the running app, for example `http://127.0.0.1:3000`. */
  readonly baseUrl: string;
  /** Value of the environment variable named by `contract.passwordEnv`. */
  readonly password: string;
  /** Marks the rows this run creates. The caller logs it, so a run can be reproduced and cleaned. */
  readonly runId: string;
  readonly fetch?: typeof fetch;
}

export interface TenantIsolationResult {
  readonly findings: readonly Finding[];
  /** Number of individual assertions evaluated. A suite that evaluated none must not pass. */
  readonly checks: number;
}

interface Reply {
  readonly status: number;
  readonly text: string;
  readonly json: unknown;
}

const NEVER_EXISTED = '00000000-0000-4000-8000-0000000000aa';

/** One signed-in principal with its own cookie jar. */
class Client {
  private readonly jar = new Map<string, string>();
  constructor(
    readonly principal: Principal,
    private readonly baseUrl: string,
    private readonly doFetch: typeof fetch,
  ) {}

  async send(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<Reply> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.jar.size > 0)
      headers['cookie'] = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const init: RequestInit = { method, headers, redirect: 'manual' };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await this.doFetch(new URL(path, this.baseUrl), init);
    for (const line of res.headers.getSetCookie()) {
      const pair = (line.split(';')[0] ?? '').split('=');
      const name = pair[0]?.trim();
      if (name) this.jar.set(name, pair.slice(1).join('='));
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, text, json };
  }
}

const is2xx = (r: Reply): boolean => r.status >= 200 && r.status < 300;
const field = (json: unknown, key: string): string | undefined => {
  if (typeof json !== 'object' || json === null) return undefined;
  const v = (json as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
};
const fill = (path: string, id: string): string => path.replace(/:[A-Za-z0-9_]+/g, id);
/** A near miss of a real id: the last hex digit changed. */
const neighbour = (id: string): string => id.slice(0, -1) + (id.endsWith('0') ? '1' : '0');

export async function runTenantIsolation(
  opts: TenantIsolationOptions,
): Promise<TenantIsolationResult> {
  const { contract } = opts;
  const doFetch = opts.fetch ?? fetch;
  const findings: Finding[] = [];
  let checks = 0;
  const clients = new Map<string, Client>();

  const fail = (ruleId: string, message: string, table: string): void => {
    findings.push({ ruleId, message: `${table}: ${message}`, severity: 'critical' });
  };
  const expect = (ok: boolean, ruleId: string, message: string, table: string): void => {
    checks += 1;
    if (!ok) fail(ruleId, message, table);
  };

  const signIn = async (p: Principal): Promise<Client | undefined> => {
    const cached = clients.get(p.key);
    if (cached) return cached;
    const c = new Client(p, opts.baseUrl, doFetch);
    const { method, path } = contract.session.signIn;
    const r = await c.send(method, path, { email: p.email, password: opts.password });
    checks += 1;
    if (!is2xx(r)) {
      findings.push({
        ruleId: 'isolation/sign-in-failed',
        message: `principal ${p.key} could not sign in (status ${r.status})`,
        severity: 'high',
      });
      return undefined;
    }
    clients.set(p.key, c);
    return c;
  };

  const principalsWith = (org: 'a' | 'b', action: TenantAction): Principal[] => {
    const roles = new Set(
      contract.roles.filter((r) => r.permissions.includes(action.permission)).map((r) => r.name),
    );
    return contract.principals.filter((p) => p.org === org && roles.has(p.role));
  };
  const call = (c: Client, a: TenantAction, id?: string, body?: unknown, query = '') =>
    c.send(a.http.method, (id === undefined ? a.http.path : fill(a.http.path, id)) + query, body);

  for (const table of contract.tables) {
    if (table.kind !== 'tenant') continue;
    const t = table.name;
    const on = (kind: TenantAction['kind']) =>
      contract.actions.find((a) => a.table === t && a.kind === kind);
    const create = on('create');
    const read = on('read');
    const list = on('list');
    const update = on('update');
    const del = on('delete');
    if (!create) {
      fail('isolation/no-create-action', 'no create action, so isolation cannot be exercised', t);
      continue;
    }
    const creatorA = principalsWith('a', create)[0];
    const creatorB = principalsWith('b', create)[0];
    if (!creatorA || !creatorB) {
      fail('isolation/no-principal', 'no principal in both orgs may call the create action', t);
      continue;
    }
    const alice = await signIn(creatorA);
    const bob = await signIn(creatorB);
    if (!alice || !bob) continue;

    const marker = `lathe-iso-${opts.runId}-${t}`;
    const made = await call(alice, create, undefined, { label: marker });
    const id = field(made.json, 'id');
    expect(
      is2xx(made) && id !== undefined,
      'isolation/create-failed',
      'org a could not create a row',
      t,
    );
    if (!id) continue;
    const orgA = field(made.json, 'org_id');
    const leaks = (r: Reply): boolean => r.text.includes(marker) || r.text.includes(id);

    // Other principals of org b (other roles) must be isolated too.
    const attackers = new Map<string, Client>();
    for (const action of [read, list, update, del]) {
      if (!action) continue;
      for (const p of principalsWith('b', action)) {
        const c = await signIn(p);
        if (c) attackers.set(p.key, c);
      }
    }

    if (read) {
      for (const c of attackers.values()) {
        if (!principalsWith('b', read).includes(c.principal)) continue;
        const foreign = await call(c, read, id);
        expect(
          foreign.status === 404 && !leaks(foreign),
          'isolation/cross-read',
          `org b (${c.principal.role}) read org a's row: status ${foreign.status}, expected 404`,
          t,
        );
        const missing = await call(c, read, NEVER_EXISTED);
        const norm = (r: Reply, x: string): string => r.text.split(x).join('<id>');
        expect(
          foreign.status === missing.status && norm(foreign, id) === norm(missing, NEVER_EXISTED),
          'isolation/distinguishable',
          `a foreign row answers differently from a missing row (status ${foreign.status} vs ${missing.status})`,
          t,
        );
        const guessed = await call(c, read, neighbour(id));
        expect(
          guessed.status === 404 && !leaks(guessed),
          'isolation/id-guess',
          `a guessed id answered status ${guessed.status}, expected 404`,
          t,
        );
      }
      const anon = await new Client(creatorB, opts.baseUrl, doFetch).send(
        read.http.method,
        fill(read.http.path, id),
      );
      expect(
        !is2xx(anon) && !leaks(anon),
        'isolation/no-session',
        `a request without a session answered status ${anon.status}`,
        t,
      );
    }
    if (list) {
      for (const c of attackers.values()) {
        if (!principalsWith('b', list).includes(c.principal)) continue;
        for (const query of ['', `?org_id=${orgA ?? NEVER_EXISTED}`]) {
          const r = await call(c, list, undefined, undefined, query);
          expect(
            is2xx(r) && !leaks(r),
            'isolation/cross-list',
            `org b list${query ? ' with org_id in the query' : ''} returned status ${r.status}` +
              (leaks(r) ? ' and included org a data' : ''),
            t,
          );
        }
      }
    }
    if (update) {
      for (const c of attackers.values()) {
        if (!principalsWith('b', update).includes(c.principal)) continue;
        const r = await call(c, update, id, { label: `${marker}-tampered` });
        expect(
          r.status === 404 && !leaks(r),
          'isolation/cross-update',
          `org b updated org a's row: status ${r.status}, expected 404`,
          t,
        );
      }
    }
    if (del) {
      for (const c of attackers.values()) {
        if (!principalsWith('b', del).includes(c.principal)) continue;
        const r = await call(c, del, id);
        expect(
          r.status === 404 && !leaks(r),
          'isolation/cross-delete',
          `org b deleted org a's row: status ${r.status}, expected 404`,
          t,
        );
      }
    }

    // The org comes from the membership, never from the request.
    const bMarker = `${marker}-b`;
    const forged = await bob.send(
      create.http.method,
      `${create.http.path}${orgA ? `?org_id=${orgA}` : ''}`,
      { label: bMarker, org_id: orgA ?? NEVER_EXISTED },
      { 'x-org-id': orgA ?? NEVER_EXISTED },
    );
    const bId = field(forged.json, 'id');
    const bOrg = field(forged.json, 'org_id');
    expect(
      orgA === undefined || bOrg === undefined || bOrg !== orgA,
      'isolation/org-from-input',
      'org b created a row in org a by sending org a in the request',
      t,
    );
    if (read) {
      const aReadsB = bId === undefined ? undefined : await call(alice, read, bId);
      expect(
        aReadsB === undefined || aReadsB.status === 404,
        'isolation/org-from-input',
        `org a can see a row org b created with org a's id in the request (status ${aReadsB?.status})`,
        t,
      );
    }
    if (list) {
      const aList = await call(alice, list);
      expect(
        !aList.text.includes(bMarker),
        'isolation/org-from-input',
        "org a's list includes a row org b created with org a's id in the request",
        t,
      );
    }

    // Org a's row is still there and unchanged.
    if (read) {
      const after = await call(alice, read, id);
      expect(
        is2xx(after) && after.text.includes(marker) && !after.text.includes('tampered'),
        'isolation/row-damaged',
        `org a's row was changed or removed by org b (status ${after.status})`,
        t,
      );
    }

    // Best effort cleanup of the rows this run made. Its result is not an assertion.
    if (del) {
      await call(alice, del, id);
      if (bId) await call(bob, del, bId);
    }
  }

  if (checks === 0)
    findings.push({
      ruleId: 'isolation/no-checks',
      message: 'the suite evaluated no assertions; a suite that checks nothing cannot pass',
      severity: 'critical',
    });
  return { findings, checks };
}
