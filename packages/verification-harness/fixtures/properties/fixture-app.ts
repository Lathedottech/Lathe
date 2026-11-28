/**
 * Fixture app for the property suite (task P2-06): an in-memory HTTP app that follows C1 and reuses
 * the contract of the tenant isolation fixture. Ids are deterministic (a counter), so a run with the
 * same seed against a fresh server reproduces the same requests and the same counterexample.
 *
 * Variants:
 *   good           roles hold exactly the contract permissions; every row is scoped to its org.
 *   leaky-by-id    the viewer role is also allowed update and delete, but only on rows whose id starts
 *                  with 0-7. A fixed-example matrix that happens to hit another id would miss it.
 *   collision      ids come from a space of three values. When an org creates an id that another org
 *                  already holds, the id becomes "shared" and the org check passes for both orgs.
 *   missing-rls-policy  list is scoped, but read, update and delete by id skip the org check.
 */
import { randomUUID, createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fixtureContract } from '../tenant-isolation/fixture-app.js';

export {
  fixtureContract as propertiesFixtureContract,
  fixtureContractWithIdField as propertiesFixtureContractWithIdField,
} from '../tenant-isolation/fixture-app.js';

export type PropertiesVariant = 'good' | 'leaky-by-id' | 'collision' | 'missing-rls-policy';

export interface PropertiesFixtureOptions {
  /** Name of the response field carrying a row's id (the contract's idField). Default id. */
  readonly idField?: string;
}

interface Row {
  id: string;
  org_id: string;
  label: string;
}
interface Session {
  org: string;
  role: string;
}

export interface PropertiesFixtureServer {
  readonly baseUrl: string;
  readonly password: string;
  close(): Promise<void>;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

export async function startPropertiesFixtureApp(
  variant: PropertiesVariant,
  options: PropertiesFixtureOptions = {},
): Promise<PropertiesFixtureServer> {
  const idName = options.idField ?? 'id';
  const shape = (v: unknown): unknown => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return v;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k === 'id' ? idName : k, x]));
  };
  const password = randomUUID();
  const orgIds = { a: randomUUID(), b: randomUUID() };
  const rows = new Map<string, Row>();
  const shared = new Set<string>();
  const sessions = new Map<string, Session>();
  let counter = 0;
  let sessionCounter = 0;

  const nextId = (): string => {
    const n = counter++;
    if (variant === 'collision') return `r${n % 3}`;
    return createHash('sha256').update(`row-${n}`).digest('hex').slice(0, 32);
  };

  const server: Server = createServer((req, res) => {
    void (async () => {
      const send = (status: number, body?: unknown, headers: Record<string, string> = {}): void => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(body === undefined ? '' : JSON.stringify(shape(body)));
      };
      const notFound = (): void => send(404, { code: 'not_found', message: 'Not found' });
      try {
        const url = new URL(req.url ?? '/', 'http://fixture.invalid');
        const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);

        if (req.method === 'POST' && url.pathname === '/api/auth/sign-in') {
          const principal = fixtureContract.principals.find((p) => p.email === body['email']);
          if (!principal || body['password'] !== password)
            return send(401, { code: 'unauthenticated', message: 'Sign in failed' });
          const sid = `s${sessionCounter++}-${randomUUID()}`;
          sessions.set(sid, { org: orgIds[principal.org], role: principal.role });
          return send(200, { ok: true }, { 'set-cookie': `sid=${sid}; HttpOnly; Path=/` });
        }

        const sid = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
        const session = sid ? sessions.get(sid) : undefined;
        if (!session) return send(401, { code: 'unauthenticated', message: 'Sign in required' });

        const granted = (permission: string, id?: string): boolean => {
          const declared = fixtureContract.roles.find((r) => r.name === session.role);
          if (declared?.permissions.includes(permission)) return true;
          return (
            variant === 'leaky-by-id' &&
            session.role === 'viewer' &&
            (permission === 'items.update' || permission === 'items.delete') &&
            id !== undefined &&
            /^[0-7]/.test(id)
          );
        };
        const mine = (id: string): Row | undefined => {
          const r = rows.get(id);
          if (!r) return undefined;
          if (r.org_id === session.org || variant === 'missing-rls-policy') return r;
          // Planted: the org check is skipped for an id that two orgs both created.
          return variant === 'collision' && shared.has(id) ? r : undefined;
        };

        const m = /^\/api\/items(?:\/([^/]+))?$/.exec(url.pathname);
        if (!m) return notFound();
        const id = m[1];

        if (id === undefined && req.method === 'POST') {
          if (!granted('items.create')) return notFound();
          const newId = nextId();
          const existing = rows.get(newId);
          if (existing && existing.org_id !== session.org) {
            // Keep the first owner's row; the second org is told its create worked.
            shared.add(newId);
            return send(201, {
              id: newId,
              org_id: session.org,
              label: String(body['label'] ?? ''),
            });
          }
          const row: Row = { id: newId, org_id: session.org, label: String(body['label'] ?? '') };
          rows.set(row.id, row);
          return send(201, row);
        }
        if (id === undefined && req.method === 'GET') {
          if (!granted('items.list')) return notFound();
          return send(200, { items: [...rows.values()].filter((r) => r.org_id === session.org) });
        }
        if (id !== undefined && req.method === 'GET') {
          if (!granted('items.read', id)) return notFound();
          const row = mine(id);
          return row ? send(200, row) : notFound();
        }
        if (id !== undefined && req.method === 'PATCH') {
          if (!granted('items.update', id)) return notFound();
          const row = mine(id);
          if (!row) return notFound();
          row.label = String(body['label'] ?? row.label);
          return send(200, row);
        }
        if (id !== undefined && req.method === 'DELETE') {
          if (!granted('items.delete', id)) return notFound();
          if (!mine(id)) return notFound();
          rows.delete(id);
          return send(204);
        }
        return notFound();
      } catch {
        return send(400, { code: 'bad_request', message: 'Bad request' });
      }
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    password,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
        server.closeAllConnections();
      }),
  };
}
