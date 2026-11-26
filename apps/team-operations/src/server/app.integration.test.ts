/**
 * HTTP-level tests of Team Operations against real PostgreSQL (task P7-02): the P7-01
 * hierarchy org -> team -> project through the app's routes.
 * Requests go through the real route handlers, Better Auth sign-in, `defineAction`,
 * RLS and audit. Only the Next.js server itself is not involved.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { createAuth, parseOrgId, seedDemo, withTenant } from '@lathe/application-foundation';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as authRoute from '../app/auth/[...all]/route';
import * as meRoute from '../app/v1/me/route';
import * as projectRoute from '../app/v1/projects/[projectId]/route';
import * as taskRoute from '../app/v1/projects/[projectId]/tasks/[id]/route';
import * as tasksRoute from '../app/v1/projects/[projectId]/tasks/route';
import * as deniesRoute from '../app/v1/scopes/denies/route';
import * as removeDenyRoute from '../app/v1/scopes/denies/remove/route';
import * as grantsRoute from '../app/v1/scopes/grants/route';
import * as teamProjectsRoute from '../app/v1/teams/[teamId]/projects/route';
import * as teamRoute from '../app/v1/teams/[teamId]/route';
import * as teamsRoute from '../app/v1/teams/route';
import * as activeOrgRoute from '../app/v1/session/active-org/route';
import { closeDeps, getDeps } from './deps';
import type { RouteHandler } from './http';

const run = randomUUID().slice(0, 8);
const password = randomBytes(18).toString('base64url');
const orgA = randomUUID();
const orgB = randomUUID();
const email = (role: string, org: string) => `${role}-${run}@team-operations-org-${org}.test`;

let base: string;
const cookies = new Map<string, string>();

async function signIn(who: string): Promise<string> {
  const res = await authRoute.POST(
    new Request(`${base}/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: base,
        // A random client address per sign-in, so repeated runs never hit the sign-in rate limit.
        'x-forwarded-for': `10.${randomBytes(3).join('.')}`,
      },
      body: JSON.stringify({ email: who, password }),
    }),
  );
  expect(res.status).toBe(200);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c.length > 0)
    .join('; ');
  expect(cookie).toContain('session_token');
  return cookie;
}

interface Call {
  readonly status: number;
  readonly json: unknown;
  readonly requestId: string | null;
}

async function call(
  handler: RouteHandler,
  method: string,
  path: string,
  options: {
    who?: string | null;
    body?: unknown;
    params?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): Promise<Call> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.who) headers['cookie'] = cookies.get(options.who) ?? '';
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    headers['content-type'] ??= 'application/json';
    init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  // Like Next.js: dynamic routes get params, static routes get a context without params.
  const context = options.params
    ? { params: Promise.resolve(options.params) }
    : { params: Promise.resolve(undefined) };
  const res = await handler(new Request(`${base}${path}`, init), context);
  const text = await res.text();
  return {
    status: res.status,
    json: text === '' ? undefined : JSON.parse(text),
    requestId: res.headers.get('x-request-id'),
  };
}

const field = (json: unknown, key: string): unknown =>
  typeof json === 'object' && json !== null ? (json as Record<string, unknown>)[key] : undefined;

/** `<org>-<label>` -> role. Guests get access only through scope grants below. */
const PEOPLE = [
  ['owner', 'a', 'owner'],
  ['owner2', 'a', 'owner'],
  ['manager', 'a', 'manager'],
  ['member', 'a', 'member'],
  ['guest', 'a', 'guest'],
  ['guest2', 'a', 'guest'],
  ['owner', 'b', 'owner'],
] as const;
const membershipOf = new Map<string, string>();

beforeAll(async () => {
  base = getDeps().baseUrl;
  const { db } = getDeps();
  const seeder = createAuth({
    db,
    secret: randomBytes(32).toString('base64url'),
    baseURL: base,
    trustedOrigins: [base],
    allowSignUp: true,
  });
  await seedDemo(seeder, db, {
    orgs: { a: { id: orgA, name: `Org A ${run}` }, b: { id: orgB, name: `Org B ${run}` } },
    users: PEOPLE.map(([label, org, role]) => ({
      name: `${label} ${org}`,
      email: email(label, org),
      memberOf: [{ org, role }],
    })),
    password,
  });
  for (const [label, org] of PEOPLE) {
    const who = `${org}-${label}`;
    cookies.set(who, await signIn(email(label, org)));
    const me = await call(meRoute.GET, 'GET', '/v1/me', { who });
    const memberships = field(me.json, 'memberships') as { membershipId: string }[];
    const membershipId = memberships[0]?.membershipId ?? '';
    membershipOf.set(who, membershipId);
    const set = await call(activeOrgRoute.POST, 'POST', '/v1/session/active-org', {
      who,
      body: { membershipId },
    });
    expect(set.status).toBe(200);
  }
});

afterAll(async () => {
  await closeDeps();
});

const newTeam = async (who: string, name: string) => {
  const r = await call(teamsRoute.POST, 'POST', '/v1/teams', { who, body: { name } });
  expect(r.status, `${who} creates team ${name}`).toBe(201);
  return String(field(r.json, 'id'));
};
const newProject = async (who: string, teamId: string, name: string) => {
  const r = await call(teamProjectsRoute.POST, 'POST', `/v1/teams/${teamId}/projects`, {
    who,
    params: { teamId },
    body: { name },
  });
  expect(r.status, `${who} creates project ${name}`).toBe(201);
  return String(field(r.json, 'id'));
};
const getTeam = (who: string, teamId: string) =>
  call(teamRoute.GET, 'GET', `/v1/teams/${teamId}`, { who, params: { teamId } });
const getProject = (who: string, projectId: string) =>
  call(projectRoute.GET, 'GET', `/v1/projects/${projectId}`, { who, params: { projectId } });
const listTasks = (who: string, projectId: string) =>
  call(tasksRoute.GET, 'GET', `/v1/projects/${projectId}/tasks`, { who, params: { projectId } });
const createTask = (who: string, projectId: string, body: Record<string, unknown>) =>
  call(tasksRoute.POST, 'POST', `/v1/projects/${projectId}/tasks`, {
    who,
    params: { projectId },
    body,
  });
const patchTask = (who: string, projectId: string, id: string, body: Record<string, unknown>) =>
  call(taskRoute.PATCH, 'PATCH', `/v1/projects/${projectId}/tasks/${id}`, {
    who,
    params: { projectId, id },
    body,
  });
const deleteTask = (who: string, projectId: string, id: string) =>
  call(taskRoute.DELETE, 'DELETE', `/v1/projects/${projectId}/tasks/${id}`, {
    who,
    params: { projectId, id },
  });
const grant = (who: string, scopeId: string, target: string, role: string) =>
  call(grantsRoute.POST, 'POST', '/v1/scopes/grants', {
    who,
    body: { scopeId, membershipId: membershipOf.get(target), role },
  });
const deny = (who: string, scopeId: string, target: string, permission: string) =>
  call(deniesRoute.POST, 'POST', '/v1/scopes/denies', {
    who,
    body: { scopeId, membershipId: membershipOf.get(target), permission },
  });
const teamIds = async (who: string) => {
  const r = await call(teamsRoute.GET, 'GET', '/v1/teams', { who });
  expect(r.status).toBe(200);
  return (r.json as { id: string }[]).map((t) => t.id);
};

let t1: string, t2: string, p1: string, p2: string, p3: string;
beforeAll(async () => {
  t1 = await newTeam('a-manager', `Platform ${run}`);
  t2 = await newTeam('a-manager', `Support ${run}`);
  p1 = await newProject('a-manager', t1, `API ${run}`);
  p2 = await newProject('a-manager', t1, `Web ${run}`);
  p3 = await newProject('a-manager', t2, `Help ${run}`);
});

describe('teams and projects', () => {
  it('only managers and owners create teams; names are unique per org', async () => {
    const byMember = await call(teamsRoute.POST, 'POST', '/v1/teams', {
      who: 'a-member',
      body: { name: 'mine' },
    });
    expect(byMember.status).toBe(403);
    const dup = await call(teamsRoute.POST, 'POST', '/v1/teams', {
      who: 'a-owner',
      body: { name: `Platform ${run}` },
    });
    expect(dup.status).toBe(409);
  });

  it('a member sees every team and project; a guest without grants sees none', async () => {
    expect(await teamIds('a-member')).toEqual(expect.arrayContaining([t1, t2]));
    expect(await teamIds('a-guest')).toEqual([]);
    expect((await getTeam('a-guest', t1)).status).toBe(403);
    expect((await getProject('a-guest', p1)).status).toBe(403);
  });

  it('a team id used as a project id (and back) is 404', async () => {
    expect((await getProject('a-member', t1)).status).toBe(404);
    expect((await getTeam('a-member', p1)).status).toBe(404);
    const r = await call(teamProjectsRoute.POST, 'POST', `/v1/teams/${p1}/projects`, {
      who: 'a-manager',
      params: { teamId: p1 },
      body: { name: 'nested' },
    });
    expect(r.status).toBe(404);
  });
});

describe('tasks', () => {
  it('members create, update and list tasks; only managers delete', async () => {
    const made = await createTask('a-member', p1, { title: `ship ${run}` });
    expect(made.status).toBe(201);
    const id = String(field(made.json, 'id'));
    expect((await patchTask('a-member', p1, id, { status: 'doing' })).status).toBe(200);
    const listed = await listTasks('a-member', p1);
    expect(JSON.stringify(listed.json)).toContain(`ship ${run}`);
    expect((await deleteTask('a-member', p1, id)).status).toBe(403);
    expect((await deleteTask('a-manager', p1, id)).status).toBe(204);
  });

  it('a task id under the wrong project is 404, even in the same team', async () => {
    const made = await createTask('a-member', p1, { title: `wrong ${run}` });
    const id = String(field(made.json, 'id'));
    expect((await patchTask('a-member', p2, id, { title: 'x' })).status).toBe(404);
    expect((await deleteTask('a-manager', p2, id)).status).toBe(404);
  });

  it('the assignee must be able to work on the project', async () => {
    const ok = await createTask('a-member', p1, {
      title: `assigned ${run}`,
      assigneeMembershipId: membershipOf.get('a-member'),
    });
    expect(ok.status).toBe(201);
    const toGuest = await createTask('a-member', p1, {
      title: 'x',
      assigneeMembershipId: membershipOf.get('a-guest'),
    });
    expect(toGuest.status).toBe(400);
    const toOtherOrg = await createTask('a-member', p1, {
      title: 'x',
      assigneeMembershipId: membershipOf.get('b-owner'),
    });
    expect(toOtherOrg.status).toBe(404);
  });
});

describe('hierarchy: inheritance, explicit deny, no escalation (P7-01)', () => {
  it('a team grant gives a guest that team and its projects, not the sibling team', async () => {
    expect((await grant('a-manager', t1, 'a-guest', 'contributor')).status).toBe(201);
    expect(await teamIds('a-guest')).toEqual([t1]);
    const team = await getTeam('a-guest', t1);
    expect(team.status).toBe(200);
    expect((field(team.json, 'projects') as { id: string }[]).map((p) => p.id).sort()).toEqual(
      [p1, p2].sort(),
    );
    expect((await createTask('a-guest', p1, { title: `guest ${run}` })).status).toBe(201);
    expect((await getProject('a-guest', p3)).status).toBe(403);
    expect((await createTask('a-guest', p3, { title: 'x' })).status).toBe(403);
  });

  it('a project grant reaches that project only, never its team', async () => {
    expect((await grant('a-manager', p3, 'a-guest2', 'reader')).status).toBe(201);
    expect((await getProject('a-guest2', p3)).status).toBe(200);
    expect((await listTasks('a-guest2', p3)).status).toBe(200);
    expect((await createTask('a-guest2', p3, { title: 'x' })).status).toBe(403);
    expect((await getTeam('a-guest2', t2)).status).toBe(403);
    expect(await teamIds('a-guest2')).toEqual([]);
  });

  it('a deny on a project wins over the inherited team grant and over the owner', async () => {
    expect((await deny('a-manager', p2, 'a-guest', 'tasks.create')).status).toBe(201);
    expect((await createTask('a-guest', p2, { title: 'x' })).status).toBe(403);
    expect((await createTask('a-guest', p1, { title: `still ok ${run}` })).status).toBe(201);

    expect((await deny('a-owner2', p2, 'a-owner', 'projects.read')).status).toBe(201);
    expect((await getProject('a-owner', p2)).status).toBe(403);
    const team = await getTeam('a-owner', t1);
    expect((field(team.json, 'projects') as { id: string }[]).map((p) => p.id)).toEqual([p1]);
    // The owner cannot lift a deny on themselves.
    const lift = await call(removeDenyRoute.POST, 'POST', '/v1/scopes/denies/remove', {
      who: 'a-owner',
      body: { scopeId: p2, membershipId: membershipOf.get('a-owner'), permission: 'projects.read' },
    });
    expect(lift.status).toBe(403);
  });

  it('a manager cannot grant the owner role, and a member cannot grant anything', async () => {
    expect((await grant('a-manager', t2, 'a-guest2', 'owner')).status).toBe(403);
    expect((await grant('a-member', t2, 'a-guest2', 'reader')).status).toBe(403);
  });
});

describe('tenant isolation', () => {
  it("org b gets 404 for org a's teams, projects and tasks, exactly like missing ones", async () => {
    const missing = randomUUID();
    const foreign = await getTeam('b-owner', t1);
    const absent = await getTeam('b-owner', missing);
    expect([foreign.status, absent.status]).toEqual([404, 404]);
    expect((await getProject('b-owner', p1)).status).toBe(404);
    expect((await listTasks('b-owner', p1)).status).toBe(404);
    expect((await createTask('b-owner', p1, { title: 'x' })).status).toBe(404);
    expect(await teamIds('b-owner')).not.toContain(t1);
    const r = await call(teamProjectsRoute.POST, 'POST', `/v1/teams/${t1}/projects`, {
      who: 'b-owner',
      params: { teamId: t1 },
      body: { name: 'intrusion' },
    });
    expect(r.status).toBe(404);
  });

  it("org b cannot grant itself access to org a's team", async () => {
    const r = await call(grantsRoute.POST, 'POST', '/v1/scopes/grants', {
      who: 'b-owner',
      body: { scopeId: t1, membershipId: membershipOf.get('b-owner'), role: 'member' },
    });
    expect(r.status).toBe(404);
  });

  it('without a session every route answers 401', async () => {
    const id = randomUUID();
    const results = await Promise.all([
      call(teamsRoute.GET, 'GET', '/v1/teams'),
      call(teamRoute.GET, 'GET', `/v1/teams/${id}`, { params: { teamId: id } }),
      call(projectRoute.GET, 'GET', `/v1/projects/${id}`, { params: { projectId: id } }),
      call(tasksRoute.GET, 'GET', `/v1/projects/${id}/tasks`, { params: { projectId: id } }),
    ]);
    expect(results.map((r) => r.status)).toEqual([401, 401, 401, 401]);
  });

  it('the database refuses a team without a matching scope, and a project in another org', async () => {
    const { db } = getDeps();
    const code = async (statement: ReturnType<typeof sql>, org: string) => {
      try {
        await withTenant(db, parseOrgId(org), (tx) => tx.execute(statement));
        return 'allowed';
      } catch (error) {
        for (let e: unknown = error; e instanceof Error; e = e.cause) {
          const c = (e as { code?: unknown }).code;
          if (typeof c === 'string') return c;
        }
        throw error;
      }
    };
    const fake = randomUUID();
    expect(
      await code(sql`INSERT INTO teams (id, org_id, name) VALUES (${fake}, ${orgA}, 'x')`, orgA),
    ).toBe('23503');
    // A project whose scope is a team, not a project.
    expect(
      await code(
        sql`INSERT INTO projects (id, org_id, team_id, name) VALUES (${t2}, ${orgA}, ${t1}, 'x')`,
        orgA,
      ),
    ).toBe('23503');
    // Org b cannot point a project at org a's team.
    expect(
      await code(
        sql`INSERT INTO projects (id, org_id, team_id, name) VALUES (${fake}, ${orgB}, ${t1}, 'x')`,
        orgB,
      ),
    ).toBe('23503');
  });
});
