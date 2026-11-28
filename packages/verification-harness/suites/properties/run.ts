/**
 * Property-based suite (task P2-06), driven only by the C1 tenant contract.
 *
 * fast-check generates sequences of operations (principal, action, resource) and the suite sends
 * them to the app through the contract's routes. Invariants checked after every operation:
 *   1. no-grant-without-permission: a call answered 2xx must be allowed by the contract role map
 *      for that principal's role.
 *   2. tenant-never-crosses: a response never contains a marker written by the other org, and a
 *      2xx on a row id is only possible for an org that created that id.
 *   3. explicit-deny-wins: needs the hierarchy of C1 v2 (P7-01 is in the foundation, the contract
 *      is not yet). It is reported as `pending` and never as passed.
 *
 * Reproducibility: the seed is always logged. Without an explicit seed it is derived from the run id
 * and app name, never from time or entropy. Running again with the same seed (and the same number
 * of runs) against a freshly started app replays the same requests and finds the same
 * counterexample. The path alone is not replayable, because the app keeps state across runs.
 * Findings carry rule ids,
 * seed and path, never passwords or response bodies.
 */
import { createHash } from 'node:crypto';
import fc from 'fast-check';
import type { Finding, Principal, TenantAction, TenantContract } from '@lathe/shared-contracts';

export interface PropertiesOptions {
  readonly contract: TenantContract;
  readonly baseUrl: string;
  /** Value of the environment variable named by `contract.passwordEnv`. */
  readonly password: string;
  readonly runId: string;
  /** Default 50. */
  readonly numRuns?: number;
  /** Default derived from `runId` and the app name. */
  readonly seed?: number;
  readonly fetch?: typeof fetch;
}

export interface PendingInvariant {
  readonly id: string;
  readonly status: 'pending';
  readonly reason: string;
}

export interface PropertiesResult {
  readonly findings: readonly Finding[];
  /** Individual invariant checks evaluated (including during shrinking). */
  readonly checks: number;
  readonly runs: number;
  readonly seed: number;
  /** fast-check path of the counterexample, or null when no invariant was violated. */
  readonly path: string | null;
  /** Human-readable counterexample (indexes into the contract), or null. */
  readonly counterexample: string | null;
  /** Invariants that cannot be evaluated yet. Never counted as passing. */
  readonly pending: readonly PendingInvariant[];
}

export const PENDING_INVARIANTS: readonly PendingInvariant[] = [
  {
    id: 'explicit-deny-wins',
    status: 'pending',
    reason: 'needs the C1 v2 hierarchy (P7-01 is in the foundation, the contract is not yet)',
  },
];

class Violation extends Error {
  constructor(
    readonly ruleId: string,
    message: string,
  ) {
    super(message);
  }
}

interface Reply {
  readonly status: number;
  readonly text: string;
  readonly json: unknown;
}

class Client {
  private readonly jar = new Map<string, string>();
  constructor(
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
/** Reads the row id from the response field the contract declares (idField, default id). */
const idOf = (json: unknown, idField: string): string | undefined => {
  if (typeof json !== 'object' || json === null) return undefined;
  const v = (json as Record<string, unknown>)[idField];
  return typeof v === 'string' ? v : undefined;
};

/** Seed derived only from logged inputs, so the default is reproducible. */
export function defaultSeed(runId: string, app: string): number {
  return createHash('sha256')
    .update(`lathe-properties/v1\n${runId}\n${app}`)
    .digest()
    .readInt32BE(0);
}

export async function runProperties(opts: PropertiesOptions): Promise<PropertiesResult> {
  const { contract } = opts;
  const doFetch = opts.fetch ?? fetch;
  const numRuns = opts.numRuns ?? 50;
  const seed = opts.seed ?? defaultSeed(opts.runId, contract.app);
  const findings: Finding[] = [];
  let checks = 0;

  const actions = contract.actions.filter((a) =>
    contract.tables.some((t) => t.kind === 'tenant' && t.name === a.table),
  );
  const principals = contract.principals;
  const permissionsOf = (role: string): ReadonlySet<string> =>
    new Set(contract.roles.find((r) => r.name === role)?.permissions);

  const fail = (ruleId: string, message: string, severity: Finding['severity'] = 'high'): void => {
    findings.push({ ruleId, message: message.slice(0, 2_000), severity });
  };

  const clients = new Map<string, Client>();
  for (const p of principals) {
    const c = new Client(opts.baseUrl, doFetch);
    const { method, path } = contract.session.signIn;
    const r = await c.send(method, path, { email: p.email, password: opts.password });
    checks += 1;
    if (!is2xx(r)) {
      fail(
        'properties/sign-in-failed',
        `principal ${p.key} could not sign in (status ${r.status})`,
      );
      continue;
    }
    clients.set(p.key, c);
  }
  if (actions.length === 0 || principals.length === 0 || clients.size < principals.length) {
    if (findings.length === 0)
      fail(
        'properties/no-operations',
        'the contract offers no tenant action or principal',
        'critical',
      );
    return {
      findings,
      checks,
      runs: 0,
      seed,
      path: null,
      counterexample: null,
      pending: PENDING_INVARIANTS,
    };
  }

  // Model: who created which id, and who sent which marker. Grows across runs on purpose, since the
  // app also keeps its rows across runs.
  const idOwners = new Map<string, Set<string>>();
  const markerOwner = new Map<string, Principal['org']>();
  let counter = 0;
  const safeRun = opts.runId.replace(/[^A-Za-z0-9-]/g, '');
  const markerPattern = new RegExp(`lathe-prop-${safeRun}-\\d+`, 'g');

  const opArb = fc.record({
    p: fc.nat(principals.length - 1),
    a: fc.nat(actions.length - 1),
    r: fc.nat(1_000),
  });
  const known = (): string[] => [...idOwners.keys()];

  const property = fc.asyncProperty(
    fc.array(opArb, { minLength: 1, maxLength: 12 }),
    async (ops) => {
      for (const op of ops) {
        const principal = principals[op.p] as Principal;
        const action = actions[op.a] as TenantAction;
        const client = clients.get(principal.key) as Client;
        const needsId = action.http.path.includes(':');
        const ids = known();
        const target = needsId
          ? ids.length > 0
            ? ids[op.r % ids.length]
            : 'probe-unknown'
          : undefined;
        const marker = `lathe-prop-${safeRun}-${counter++}`;
        markerOwner.set(marker, principal.org);
        const body =
          action.http.method === 'GET' || action.http.method === 'DELETE'
            ? undefined
            : { label: marker };
        const reply = await client.send(
          action.http.method,
          target === undefined ? action.http.path : fill(action.http.path, target),
          body,
        );
        const where = `${principal.key} (${principal.role}, org ${principal.org}) ${action.id}`;

        // 1. no grant without permission
        checks += 1;
        if (is2xx(reply) && !permissionsOf(principal.role).has(action.permission))
          throw new Violation(
            'properties/grant-without-permission',
            `${where} answered status ${reply.status} but the contract role map does not grant ${action.permission}`,
          );

        // 2. tenant never crosses
        checks += 1;
        for (const seen of reply.text.match(markerPattern) ?? []) {
          const owner = markerOwner.get(seen);
          if (owner !== undefined && owner !== principal.org)
            throw new Violation(
              'properties/tenant-crossed',
              `${where} received a row written by org ${owner} (status ${reply.status})`,
            );
        }
        if (
          target !== undefined &&
          action.kind !== 'list' &&
          is2xx(reply) &&
          !idOwners.get(target)?.has(principal.org)
        )
          throw new Violation(
            'properties/tenant-crossed',
            `${where} answered status ${reply.status} for a row id that org ${principal.org} never created`,
          );

        if (action.kind === 'create' && is2xx(reply)) {
          const id = idOf(reply.json, action.idField ?? 'id');
          if (id !== undefined) {
            const owners = idOwners.get(id) ?? new Set<string>();
            owners.add(principal.org);
            idOwners.set(id, owners);
          }
        }
      }
    },
  );

  const details = await fc.check(property, { seed, numRuns });

  // Fail closed: with no created id the id-ownership checks never ran, so a pass would be vacuous.
  if (!details.failed && idOwners.size === 0)
    fail(
      'properties/no-ids',
      'no create action returned a row id under its idField, so the id-ownership checks did not run',
      'critical',
    );

  let path: string | null = null;
  let counterexample: string | null = null;
  if (details.failed) {
    path = details.counterexamplePath;
    const ops = (details.counterexample?.[0] ?? []) as Array<{ p: number; a: number; r: number }>;
    counterexample = ops.map((o) => `[p${o.p} a${o.a} r${o.r}]`).join(' ');
    const err = details.errorInstance;
    const violation = err instanceof Violation ? err : undefined;
    fail(
      violation?.ruleId ?? 'properties/error',
      `${violation?.message ?? 'the property run failed with an unexpected error'}. ` +
        `seed=${seed} path=${path ?? 'none'} counterexample=${counterexample}`,
      violation ? 'critical' : 'high',
    );
  }
  return {
    findings,
    checks,
    runs: details.numRuns,
    seed,
    path,
    counterexample,
    pending: PENDING_INVARIANTS,
  };
}
