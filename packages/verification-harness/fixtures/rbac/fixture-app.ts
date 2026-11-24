/**
 * Fixture app for the RBAC matrix suite (task P2-05): a small in-memory HTTP app that follows C1,
 * in a good variant and in variants with a planted authorization defect. It reuses the contract of
 * the tenant isolation fixture, so the two suites are exercised against the same roles and actions.
 * The password is generated per server and never written anywhere.
 *
 * Variants:
 *   good                 every role gets exactly the permissions the contract declares; denials are 404.
 *   over-permissive-role the viewer role is also allowed items.update and items.delete, which the contract denies.
 *   editor-locked-out    the editor role is denied items.update, which the contract allows.
 *   mutates-on-deny      the viewer's delete answers 404 but still removes the row.
 *   forbidden-ok         denials answer 403 (allowed by the suite); used to prove 403 is accepted.
 *   open-without-session an unauthenticated list request is answered with data.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fixtureContract } from '../tenant-isolation/fixture-app.js';

export { fixtureContract as rbacFixtureContract } from '../tenant-isolation/fixture-app.js';

export type RbacVariant =
  | 'good'
  | 'over-permissive-role'
  | 'editor-locked-out'
  | 'mutates-on-deny'
  | 'forbidden-ok'
  | 'open-without-session';

interface Row {
  id: string;
  org_id: string;
  label: string;
}
interface Session {
  org: string;
  role: string;
}

export interface RbacFixtureServer {
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

function grantsFor(variant: RbacVariant, role: string): ReadonlySet<string> {
  const declared = new Set(fixtureContract.roles.find((r) => r.name === role)?.permissions);
  if (variant === 'over-permissive-role' && role === 'viewer') {
    declared.add('items.update');
    declared.add('items.delete');
  }
  if (variant === 'editor-locked-out' && role === 'editor') declared.delete('items.update');
  if (variant === 'mutates-on-deny' && role === 'viewer') declared.delete('items.delete');
  return declared;
}

export async function startRbacFixtureApp(variant: RbacVariant): Promise<RbacFixtureServer> {
  const password = randomUUID();
  const orgIds = { a: randomUUID(), b: randomUUID() };
  const rows = new Map<string, Row>();
  const sessions = new Map<string, Session>();

  const server: Server = createServer((req, res) => {
    void (async () => {
      const send = (status: number, body?: unknown, headers: Record<string, string> = {}): void => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(body === undefined ? '' : JSON.stringify(body));
      };
      try {
        const url = new URL(req.url ?? '/', 'http://fixture.invalid');
        const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);

        if (req.method === 'POST' && url.pathname === '/api/auth/sign-in') {
          const principal = fixtureContract.principals.find((p) => p.email === body['email']);
          if (!principal || body['password'] !== password)
            return send(401, { code: 'unauthenticated', message: 'Sign in failed' });
          const sid = randomUUID();
          sessions.set(sid, { org: orgIds[principal.org], role: principal.role });
          return send(200, { ok: true }, { 'set-cookie': `sid=${sid}; HttpOnly; Path=/` });
        }

        const sid = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
        const session = sid ? sessions.get(sid) : undefined;
        const m = /^\/api\/items(?:\/([^/]+))?$/.exec(url.pathname);
        if (!session) {
          if (variant === 'open-without-session' && m && !m[1] && req.method === 'GET')
            return send(200, { items: [...rows.values()] });
          return send(401, { code: 'unauthenticated', message: 'Sign in required' });
        }
        const denyStatus = variant === 'forbidden-ok' ? 403 : 404;
        const grants = grantsFor(variant, session.role);
        const deny = (): void => send(denyStatus, { code: 'denied', message: 'Denied' });
        const mine = (id: string): Row | undefined => {
          const r = rows.get(id);
          return r && r.org_id === session.org ? r : undefined;
        };

        if (!m) return send(404, { code: 'not_found', message: 'Not found' });
        const id = m[1];

        if (id === undefined && req.method === 'POST') {
          if (!grants.has('items.create')) return deny();
          const row: Row = {
            id: randomUUID(),
            org_id: session.org,
            label: String(body['label'] ?? ''),
          };
          rows.set(row.id, row);
          return send(201, row);
        }
        if (id === undefined && req.method === 'GET') {
          if (!grants.has('items.list')) return deny();
          return send(200, { items: [...rows.values()].filter((r) => r.org_id === session.org) });
        }
        if (id !== undefined && req.method === 'GET') {
          if (!grants.has('items.read')) return deny();
          const row = mine(id);
          return row ? send(200, row) : send(404, { code: 'not_found', message: 'Not found' });
        }
        if (id !== undefined && req.method === 'PATCH') {
          if (!grants.has('items.update')) return deny();
          const row = mine(id);
          if (!row) return send(404, { code: 'not_found', message: 'Not found' });
          row.label = String(body['label'] ?? row.label);
          return send(200, row);
        }
        if (id !== undefined && req.method === 'DELETE') {
          if (!grants.has('items.delete')) {
            if (variant === 'mutates-on-deny' && mine(id)) rows.delete(id);
            return deny();
          }
          if (!mine(id)) return send(404, { code: 'not_found', message: 'Not found' });
          rows.delete(id);
          return send(204);
        }
        return send(404, { code: 'not_found', message: 'Not found' });
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
