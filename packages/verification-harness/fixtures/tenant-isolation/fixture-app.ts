/**
 * Fixture app for the tenant isolation suite (task P2-04): a small in-memory HTTP app that follows
 * C1, in a good variant and in variants with a planted leak. No real app exists yet, so the suite
 * is proven against these. The password is generated per server and never written anywhere.
 *
 * Variants:
 *   good                  org comes from the session; everything is scoped; foreign rows are 404.
 *   missing-org-filter    every query lacks the org filter and RLS is off: list, read, update, delete leak.
 *   missing-rls-policy    list is filtered in code, but by-id access has no policy: read, update, delete leak.
 *   org-from-input        the org is taken from the request body, query or header.
 *   forbidden-on-foreign  isolated, but a foreign row answers 403, which reveals that it exists.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { defineTenantContract, type TenantContract } from '@lathe/shared-contracts';

export type Variant =
  'good' | 'missing-org-filter' | 'missing-rls-policy' | 'org-from-input' | 'forbidden-on-foreign';

export const PASSWORD_ENV = 'LATHE_FIXTURE_PASSWORD';

export const fixtureContract: TenantContract = defineTenantContract({
  contractVersion: 1,
  app: 'fixture-app',
  permissions: ['items.read', 'items.list', 'items.create', 'items.update', 'items.delete'],
  roles: [
    {
      name: 'editor',
      permissions: ['items.read', 'items.list', 'items.create', 'items.update', 'items.delete'],
    },
    { name: 'viewer', permissions: ['items.read', 'items.list'] },
  ],
  tables: [
    {
      kind: 'organization',
      name: 'organizations',
      primaryKey: 'id',
      rls: { enabled: true, forced: true },
    },
    {
      kind: 'audit',
      name: 'audit_events',
      orgColumn: 'org_id',
      appendOnly: true,
      rls: { enabled: true, forced: true },
    },
    {
      kind: 'tenant',
      name: 'items',
      orgColumn: 'org_id',
      primaryKey: 'id',
      rls: { enabled: true, forced: true },
    },
  ],
  actions: [
    {
      id: 'items.create',
      permission: 'items.create',
      kind: 'create',
      table: 'items',
      http: { method: 'POST', path: '/api/items' },
    },
    {
      id: 'items.get',
      permission: 'items.read',
      kind: 'read',
      table: 'items',
      http: { method: 'GET', path: '/api/items/:id' },
    },
    {
      id: 'items.list',
      permission: 'items.list',
      kind: 'list',
      table: 'items',
      http: { method: 'GET', path: '/api/items' },
    },
    {
      id: 'items.update',
      permission: 'items.update',
      kind: 'update',
      table: 'items',
      http: { method: 'PATCH', path: '/api/items/:id' },
    },
    {
      id: 'items.delete',
      permission: 'items.delete',
      kind: 'delete',
      table: 'items',
      http: { method: 'DELETE', path: '/api/items/:id' },
    },
  ],
  session: {
    signIn: { method: 'POST', path: '/api/auth/sign-in' },
    setActiveOrg: { method: 'POST', path: '/api/auth/active-org' },
  },
  principals: [
    { key: 'a-editor', email: 'editor@org-a.test', org: 'a', role: 'editor' },
    { key: 'a-viewer', email: 'viewer@org-a.test', org: 'a', role: 'viewer' },
    { key: 'b-editor', email: 'editor@org-b.test', org: 'b', role: 'editor' },
    { key: 'b-viewer', email: 'viewer@org-b.test', org: 'b', role: 'viewer' },
  ],
  passwordEnv: PASSWORD_ENV,
  fixtures: { strategy: 'seed-script', script: 'scripts/seed.ts' },
});

interface Row {
  id: string;
  org_id: string;
  label: string;
}
interface Session {
  org: string;
  permissions: ReadonlySet<string>;
}

export interface FixtureServer {
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

export async function startFixtureApp(variant: Variant): Promise<FixtureServer> {
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
      const notFound = (): void => send(404, { code: 'not_found', message: 'Not found' });
      try {
        const url = new URL(req.url ?? '/', 'http://fixture.invalid');
        const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);

        if (req.method === 'POST' && url.pathname === '/api/auth/sign-in') {
          const principal = fixtureContract.principals.find((p) => p.email === body['email']);
          if (!principal || body['password'] !== password)
            return send(401, { code: 'unauthenticated', message: 'Sign in failed' });
          const role = fixtureContract.roles.find((r) => r.name === principal.role);
          const sid = randomUUID();
          sessions.set(sid, {
            org: orgIds[principal.org],
            permissions: new Set(role?.permissions),
          });
          return send(200, { ok: true }, { 'set-cookie': `sid=${sid}; HttpOnly; Path=/` });
        }

        const sid = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
        const session = sid ? sessions.get(sid) : undefined;
        if (!session) return send(401, { code: 'unauthenticated', message: 'Sign in required' });
        const need = (permission: string): boolean => {
          if (session.permissions.has(permission)) return true;
          send(404, { code: 'not_found', message: 'Not found' });
          return false;
        };

        // The active org: from the session, except in the planted "org-from-input" variant.
        let org = session.org;
        if (variant === 'org-from-input') {
          const given = body['org_id'] ?? url.searchParams.get('org_id') ?? req.headers['x-org-id'];
          if (typeof given === 'string') org = given;
        }
        const unscopedById = variant === 'missing-org-filter' || variant === 'missing-rls-policy';
        const visible = (r: Row | undefined): Row | undefined =>
          r && (unscopedById || r.org_id === org) ? r : undefined;
        // 403 on a foreign row is the planted "forbidden-on-foreign" leak.
        const missing = (id: string): void => {
          const exists = rows.get(id);
          if (variant === 'forbidden-on-foreign' && exists && exists.org_id !== org)
            return send(403, { code: 'forbidden', message: 'Forbidden' });
          notFound();
        };

        const m = /^\/api\/items(?:\/([^/]+))?$/.exec(url.pathname);
        if (!m) return notFound();
        const id = m[1];

        if (id === undefined && req.method === 'POST') {
          if (!need('items.create')) return;
          const row: Row = { id: randomUUID(), org_id: org, label: String(body['label'] ?? '') };
          rows.set(row.id, row);
          return send(201, row);
        }
        if (id === undefined && req.method === 'GET') {
          if (!need('items.list')) return;
          const all = [...rows.values()];
          const items =
            variant === 'missing-org-filter' ? all : all.filter((r) => r.org_id === org);
          return send(200, { items });
        }
        if (id !== undefined && req.method === 'GET') {
          if (!need('items.read')) return;
          const row = visible(rows.get(id));
          return row ? send(200, row) : missing(id);
        }
        if (id !== undefined && req.method === 'PATCH') {
          if (!need('items.update')) return;
          const row = visible(rows.get(id));
          if (!row) return missing(id);
          row.label = String(body['label'] ?? row.label);
          return send(200, row);
        }
        if (id !== undefined && req.method === 'DELETE') {
          if (!need('items.delete')) return;
          const row = visible(rows.get(id));
          if (!row) return missing(id);
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
