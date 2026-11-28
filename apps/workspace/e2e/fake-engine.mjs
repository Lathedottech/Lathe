// TEST FIXTURE: a fake Factory Engine for the Workspace shell e2e (P9-02).
// It is NOT the Engine. It implements only the C4 routes the shell uses
// (GET /v1/me, POST /v1/session/active-org, GET /v1/projects, GET /v1/projects/:id,
// GET /v1/agents) and Better Auth's /auth/sign-in/email and /auth/sign-out, with
// the same status codes and error shape. Every response it sends is validated by
// the Workspace against the C4 schemas, exactly like a real Engine response.
// The real-Engine run waits for P3-04 (see docs/reports/P9-02-frontend.md).
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import process from 'node:process';
import { URL } from 'node:url';
/* global console */

const PORT = Number(process.env.FAKE_ENGINE_PORT);
const PASSWORD = process.env.FAKE_ENGINE_PASSWORD;
const WORKSPACE_ORIGIN = process.env.FAKE_ENGINE_TRUSTED_ORIGIN;
if (!PORT || !PASSWORD || !WORKSPACE_ORIGIN) throw new Error('fake engine: missing env');

const READ = [
  'overview.read',
  'projects.read',
  'specs.read',
  'plans.read',
  'runs.read',
  'evidence.read',
  'verification.read',
  'delivery.read',
  'agents.read',
];
// Roles of services/factory-engine/src/api/authz.ts, plus one fixture role
// ("limited") that exists only here, to exercise a role without a permission.
const ROLE_PERMISSIONS = { owner: READ, viewer: READ, limited: ['runs.read'] };

const ACME = '0a000000-0000-4000-8000-000000000001';
const GLOBEX = '0a000000-0000-4000-8000-000000000002';
const orgs = { [ACME]: 'Acme', [GLOBEX]: 'Globex' };

const users = [
  {
    id: '0b000000-0000-4000-8000-000000000001',
    name: 'Ada Owner',
    email: 'ada@lathe.test',
    memberships: [
      { membershipId: '0c000000-0000-4000-8000-000000000001', orgId: ACME, role: 'owner' },
      { membershipId: '0c000000-0000-4000-8000-000000000002', orgId: GLOBEX, role: 'viewer' },
    ],
  },
  {
    id: '0b000000-0000-4000-8000-000000000002',
    name: 'Lim Ited',
    email: 'limited@lathe.test',
    memberships: [
      { membershipId: '0c000000-0000-4000-8000-000000000003', orgId: ACME, role: 'limited' },
    ],
  },
];

const projects = {
  [ACME]: [
    {
      id: '0d000000-0000-4000-8000-000000000001',
      name: 'Support Desk KB',
      slug: 'support-desk-kb',
      targetApp: 'support-desk',
      repository: { owner: 'Lathedottech', name: 'Lathe' },
      createdAt: '2026-11-20T10:00:00.000Z',
    },
  ],
  [GLOBEX]: [
    {
      id: '0d000000-0000-4000-8000-000000000002',
      name: 'Team Ops Tasks',
      slug: 'team-ops-tasks',
      targetApp: 'team-operations',
      repository: null,
      createdAt: '2026-11-21T10:00:00.000Z',
    },
  ],
};

const agents = [
  {
    profile: 'planner',
    description: 'Drafts a task plan from a specification.',
    configSha256: 'a'.repeat(64),
  },
  {
    profile: 'builder',
    description: 'Writes the patch inside the sandbox.',
    configSha256: 'b'.repeat(64),
  },
  {
    profile: 'repair',
    description: 'Fixes a failed gate from its evidence.',
    configSha256: 'c'.repeat(64),
  },
];

/** token -> { userId, activeOrgId } */
const sessions = new Map();
const COOKIE = 'lathe.session_token';

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
const fail = (res, status, code, message) =>
  send(res, status, { code, message, requestId: randomUUID() });

function session(req) {
  const raw = req.headers.cookie ?? '';
  const token = raw
    .split(';')
    .map((p) => p.trim().split('='))
    .find(([k]) => k === COOKIE)?.[1];
  if (!token) return null;
  const s = sessions.get(token);
  return s ? { token, ...s, user: users.find((u) => u.id === s.userId) } : null;
}

function permissions(s) {
  const m = s.user.memberships.find((x) => x.orgId === s.activeOrgId);
  return m ? ROLE_PERMISSIONS[m.role] : [];
}

function me(s) {
  return {
    user: { id: s.user.id, name: s.user.name, email: s.user.email },
    memberships: s.user.memberships.map((m) => ({ ...m, orgName: orgs[m.orgId] })),
    activeOrgId: s.activeOrgId,
    permissions: permissions(s),
  };
}

async function body(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://fake-engine');
  const path = url.pathname;

  // Like Better Auth: cookie-bearing POSTs must come from a trusted origin.
  if (req.method === 'POST' && req.headers.origin !== WORKSPACE_ORIGIN)
    return fail(res, 403, 'forbidden', 'untrusted origin');

  if (req.method === 'POST' && path === '/auth/sign-in/email') {
    const b = await body(req);
    const user = users.find((u) => u.email === b?.email);
    if (!user || b?.password !== PASSWORD)
      return send(res, 401, {
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password',
      });
    const token = randomBytes(24).toString('base64url');
    // A new session has no active org; the user picks one (like the foundation).
    sessions.set(token, { userId: user.id, activeOrgId: null });
    return send(
      res,
      200,
      { ok: true },
      {
        'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`,
      },
    );
  }

  const s = session(req);

  if (req.method === 'POST' && path === '/auth/sign-out') {
    if (s) sessions.delete(s.token);
    return send(
      res,
      200,
      { success: true },
      {
        'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      },
    );
  }

  if (!path.startsWith('/v1/')) return fail(res, 404, 'not_found', 'not found');
  if (!s) return fail(res, 401, 'unauthenticated', 'sign in first');

  if (req.method === 'GET' && path === '/v1/me') return send(res, 200, me(s));

  if (req.method === 'POST' && path === '/v1/session/active-org') {
    const b = await body(req);
    const m = s.user.memberships.find((x) => x.membershipId === b?.membershipId);
    if (!m || Object.keys(b).length !== 1) return fail(res, 404, 'not_found', 'not found');
    sessions.set(s.token, { userId: s.userId, activeOrgId: m.orgId });
    return send(res, 200, me({ ...s, activeOrgId: m.orgId }));
  }

  const need = (perm) => {
    if (permissions(s).includes(perm)) return true;
    fail(res, 403, 'forbidden', `your role lacks ${perm}`);
    return false;
  };

  if (req.method === 'GET' && path === '/v1/projects') {
    if (!need('projects.read')) return;
    return send(res, 200, { items: projects[s.activeOrgId] ?? [], nextCursor: null });
  }
  const project = /^\/v1\/projects\/([^/]+)$/.exec(path);
  if (req.method === 'GET' && project) {
    if (!need('projects.read')) return;
    const p = (projects[s.activeOrgId] ?? []).find((x) => x.id === project[1]);
    // Another org's project is indistinguishable from a missing one.
    return p ? send(res, 200, p) : fail(res, 404, 'not_found', 'not found');
  }
  if (req.method === 'GET' && path === '/v1/agents') {
    if (!need('agents.read')) return;
    return send(res, 200, agents);
  }
  return fail(res, 404, 'not_found', 'not found');
}).listen(PORT, '127.0.0.1', () => console.log(`fake engine on ${PORT}`));
