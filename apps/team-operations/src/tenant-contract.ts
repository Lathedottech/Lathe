/**
 * Team Operations tenant contract (C1 v1). The verification harness learns about the
 * app only through it.
 *
 * Built from the same `authz` map and seed data the app uses. C1 v1 knows only org-wide
 * roles and flat resources (Q4: hierarchy is C1 v2, handoff
 * docs/handoffs/backend-to-architect-c1-v2-scopes.md), so:
 *   - only `teams` is declared as a tenant table with its flat routes;
 *   - projects, tasks and the scope rules are reached through a parent id in the path
 *     or body, which C1 v1 cannot fill. They are listed in `UNDECLARED_ROUTES` with the
 *     reason, and their isolation and scope rules are covered by the app's own
 *     integration tests until C1 v2 exists.
 */
import { defineTenantContract } from '@lathe/shared-contracts';
import { APP_SLUG } from './server/app-slug';
import { authz } from './server/authz';
import { SEED_PRINCIPALS } from './server/seed-data';

const rls = { enabled: true, forced: true } as const;

const NESTED = 'nested under a team or project id; needs C1 v2 (scopes)';

/** Routes that exist but are not declared, each with the reason. Checked by the contract test. */
export const UNDECLARED_ROUTES = [
  { method: 'POST', path: '/v1/teams/:teamId/projects', reason: NESTED },
  { method: 'GET', path: '/v1/projects/:projectId', reason: NESTED },
  { method: 'GET', path: '/v1/projects/:projectId/tasks', reason: NESTED },
  { method: 'POST', path: '/v1/projects/:projectId/tasks', reason: NESTED },
  { method: 'GET', path: '/v1/projects/:projectId/tasks/:id', reason: NESTED },
  { method: 'PATCH', path: '/v1/projects/:projectId/tasks/:id', reason: NESTED },
  { method: 'DELETE', path: '/v1/projects/:projectId/tasks/:id', reason: NESTED },
  { method: 'POST', path: '/v1/scopes/grants', reason: 'body names a scope and a membership' },
  {
    method: 'POST',
    path: '/v1/scopes/grants/revoke',
    reason: 'body names a scope and a membership',
  },
  { method: 'POST', path: '/v1/scopes/denies', reason: 'body names a scope and a membership' },
  {
    method: 'POST',
    path: '/v1/scopes/denies/remove',
    reason: 'body names a scope and a membership',
  },
  { method: 'GET', path: '/v1/scopes/:scopeId/rules', reason: NESTED },
  { method: 'GET', path: '/v1/scopes/:scopeId/permissions', reason: NESTED },
] as const;

export const tenantContract = defineTenantContract({
  contractVersion: 1,
  app: APP_SLUG,
  permissions: [...authz.permissions],
  roles: authz.roles.map((name) => ({ name, permissions: [...authz.permissionsOf(name)] })),
  tables: [
    { kind: 'organization', name: 'organizations', primaryKey: 'id', rls },
    { kind: 'audit', name: 'audit_events', orgColumn: 'org_id', appendOnly: true, rls },
    { kind: 'tenant', name: 'teams', orgColumn: 'org_id', primaryKey: 'id', rls },
  ],
  actions: [
    {
      id: 'teams.create',
      permission: 'scopes.manage',
      kind: 'create',
      table: 'teams',
      http: { method: 'POST', path: '/v1/teams' },
      sample: { name: 'Harness team' },
      markField: 'name',
    },
    {
      id: 'teams.get',
      permission: 'teams.read',
      kind: 'read',
      table: 'teams',
      http: { method: 'GET', path: '/v1/teams/:teamId' },
    },
    {
      // Everyone may call it; it returns only the teams the caller may read.
      id: 'teams.list',
      permission: 'scopes.read',
      kind: 'list',
      table: 'teams',
      http: { method: 'GET', path: '/v1/teams' },
    },
  ],
  session: {
    signIn: { method: 'POST', path: '/auth/sign-in/email' },
    setActiveOrg: { method: 'POST', path: '/v1/session/active-org' },
  },
  principals: SEED_PRINCIPALS.map((p) => ({
    key: p.key,
    email: p.email,
    org: p.org,
    role: p.role,
  })),
  passwordEnv: 'LATHE_TEST_PASSWORD',
  fixtures: { strategy: 'seed-script', script: 'scripts/seed.ts' },
});
