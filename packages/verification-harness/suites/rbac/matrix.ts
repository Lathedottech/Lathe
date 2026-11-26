/**
 * RBAC matrix suite (task P2-05), driven only by the C1 tenant contract.
 *
 * For every principal in the contract and every action, the expected outcome is derived from the
 * contract alone: allowed when the principal's role holds the action's permission, denied otherwise.
 *   - allowed: the call must answer 2xx;
 *   - denied: the call must answer 403 or 404, and the target row must be unchanged afterwards
 *     (checked through a second principal of the same org that may read it);
 *   - no session: every action must answer 401, 403 or 404.
 *
 * Each (principal, action) pair works on its own fresh row, so an allowed delete cannot hide a later
 * check. Request conventions are those of the tenant isolation suite (JSON `{ label }`, answer JSON
 * with `id`). Findings carry rule ids, routes and statuses, never passwords or response bodies.
 */
import type { Finding, Principal, TenantAction, TenantContract } from '@lathe/shared-contracts';

export interface RbacMatrixOptions {
  readonly contract: TenantContract;
  readonly baseUrl: string;
  /** Value of the environment variable named by `contract.passwordEnv`. */
  readonly password: string;
  /** Marks the rows this run creates, so a run can be reproduced and cleaned. */
  readonly runId: string;
  readonly fetch?: typeof fetch;
}

export interface RbacMatrixResult {
  readonly findings: readonly Finding[];
  /** Individual assertions evaluated. A suite that evaluated none must not pass. */
  readonly checks: number;
  /** Number of (principal, action) pairs exercised. */
  readonly pairs: number;
}

interface Reply {
  readonly status: number;
  readonly text: string;
  readonly json: unknown;
}

class Client {
  private readonly jar = new Map<string, string>();
  constructor(
    readonly principal: Principal | undefined,
    private readonly baseUrl: string,
    private readonly doFetch: typeof fetch,
  ) {}

  async send(method: string, path: string, body?: unknown): Promise<Reply> {
    const headers: Record<string, string> = {};
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
const fill = (path: string, id: string): string => path.replace(/:[A-Za-z0-9_]+/g, id);
const idOf = (json: unknown): string | undefined => {
  if (typeof json !== 'object' || json === null) return undefined;
  const v = (json as Record<string, unknown>)['id'];
  return typeof v === 'string' ? v : undefined;
};

export async function runRbacMatrix(opts: RbacMatrixOptions): Promise<RbacMatrixResult> {
  const { contract } = opts;
  const doFetch = opts.fetch ?? fetch;
  const findings: Finding[] = [];
  let checks = 0;
  let pairs = 0;
  const clients = new Map<string, Client>();

  const fail = (ruleId: string, message: string, severity: Finding['severity'] = 'high'): void => {
    findings.push({ ruleId, message, severity });
  };
  const expect = (ok: boolean, ruleId: string, message: string): void => {
    checks += 1;
    if (!ok) fail(ruleId, message);
  };

  const permissionsOf = (role: string): ReadonlySet<string> =>
    new Set(contract.roles.find((r) => r.name === role)?.permissions);
  const mayCall = (p: Principal, a: TenantAction): boolean =>
    permissionsOf(p.role).has(a.permission);

  const signIn = async (p: Principal): Promise<Client | undefined> => {
    const cached = clients.get(p.key);
    if (cached) return cached;
    const c = new Client(p, opts.baseUrl, doFetch);
    const { method, path } = contract.session.signIn;
    const r = await c.send(method, path, { email: p.email, password: opts.password });
    checks += 1;
    if (!is2xx(r)) {
      fail('rbac/sign-in-failed', `principal ${p.key} could not sign in (status ${r.status})`);
      return undefined;
    }
    clients.set(p.key, c);
    return c;
  };

  const call = (c: Client, a: TenantAction, id?: string, body?: unknown): Promise<Reply> =>
    c.send(
      a.http.method,
      id === undefined ? a.http.path : fill(a.http.path, id),
      a.http.method === 'GET' || a.http.method === 'DELETE' ? undefined : body,
    );
  const needsId = (a: TenantAction): boolean => a.http.path.includes(':');
  const label = (a: TenantAction, p: Principal): string => `${p.key} (${p.role}) ${a.id}`;

  for (const table of contract.tables) {
    if (table.kind !== 'tenant') continue;
    const t = table.name;
    const actions = contract.actions.filter((a) => a.table === t);
    const create = actions.find((a) => a.kind === 'create');
    const read = actions.find((a) => a.kind === 'read');
    const list = actions.find((a) => a.kind === 'list');
    if (!create) {
      fail('rbac/no-create-action', `${t}: no create action, so the matrix cannot be exercised`);
      continue;
    }

    for (const org of ['a', 'b'] as const) {
      const inOrg = contract.principals.filter((p) => p.org === org);
      const creator = inOrg.find((p) => mayCall(p, create));
      const viewer = inOrg.find((p) => (read ? mayCall(p, read) : list ? mayCall(p, list) : false));
      if (!creator) {
        fail('rbac/no-principal', `${t}: no principal in org ${org} may call the create action`);
        continue;
      }
      const maker = await signIn(creator);
      const watcher = viewer ? await signIn(viewer) : undefined;
      if (!maker) continue;

      // Is the row still there and unchanged? undefined when the contract offers no way to see it.
      const rowIntact = async (id: string, marker: string): Promise<boolean | undefined> => {
        if (watcher && read) {
          const r = await call(watcher, read, id);
          return is2xx(r) && r.text.includes(marker) && !r.text.includes('tampered');
        }
        if (watcher && list) {
          const r = await call(watcher, list);
          return is2xx(r) && r.text.includes(marker) && !r.text.includes('tampered');
        }
        return undefined;
      };

      for (const p of inOrg) {
        const actor = await signIn(p);
        if (!actor) continue;
        for (const action of actions) {
          pairs += 1;
          const allowed = mayCall(p, action);
          const marker = `lathe-rbac-${opts.runId}-${org}-${p.key}-${action.id}`;
          let rowId: string | undefined;
          if (needsId(action)) {
            const made = await call(maker, create, undefined, { label: marker });
            rowId = idOf(made.json);
            if (!is2xx(made) || rowId === undefined) {
              fail('rbac/setup-failed', `${label(action, p)}: could not create a row to act on`);
              continue;
            }
          }
          const body =
            action.kind === 'create' ? { label: marker } : { label: `${marker}-tampered` };
          const reply = await call(actor, action, rowId, body);

          if (allowed) {
            expect(
              is2xx(reply),
              'rbac/allowed-denied',
              `${label(action, p)} is allowed by the contract but answered status ${reply.status}`,
            );
          } else {
            expect(
              reply.status === 403 || reply.status === 404,
              'rbac/over-permissive',
              `${label(action, p)} is denied by the contract but answered status ${reply.status}`,
            );
            if (rowId !== undefined) {
              const intact = await rowIntact(rowId, marker);
              if (intact === undefined)
                fail(
                  'rbac/cannot-verify-no-mutation',
                  `${label(action, p)}: the contract has no read or list action to confirm nothing changed`,
                );
              else
                expect(
                  intact,
                  'rbac/denied-mutated',
                  `${label(action, p)} was denied but the row was changed or removed`,
                );
            } else if (action.kind === 'create' && watcher && list) {
              const seen = await call(watcher, list);
              expect(
                !seen.text.includes(marker),
                'rbac/denied-mutated',
                `${label(action, p)} was denied but a row was created`,
              );
            }
          }

          // Cleanup, best effort and never an assertion.
          const del = actions.find((a) => a.kind === 'delete');
          if (del) {
            const created = action.kind === 'create' && is2xx(reply) ? idOf(reply.json) : rowId;
            if (created) await call(maker, del, created);
          }
        }
      }
    }

    // Without a session no action may succeed.
    const anon = new Client(undefined, opts.baseUrl, doFetch);
    for (const action of actions) {
      const reply = await call(anon, action, needsId(action) ? 'anonymous-probe' : undefined, {
        label: 'lathe-rbac-anonymous',
      });
      expect(
        reply.status === 401 || reply.status === 403 || reply.status === 404,
        'rbac/no-session',
        `${action.id} without a session answered status ${reply.status}`,
      );
    }
  }

  if (checks === 0)
    fail(
      'rbac/no-checks',
      'the matrix evaluated no assertions; a suite that checks nothing cannot pass',
      'critical',
    );
  return { findings, checks, pairs };
}
