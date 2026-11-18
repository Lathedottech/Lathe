/**
 * C1 Tenant contract.
 *
 * Status: DRAFT, 2026-11-17. Finalized by task P1-06; until then fields may change
 * through a handoff request to `architect`.
 * Owner: architect.
 * Producers: every app built on the foundation exports one contract
 *   (`apps/support-desk`, `apps/team-operations`, `templates/app-starter`).
 * Consumers:
 *   - `packages/verification-harness`: tenant isolation, RBAC matrix and
 *     deny-by-default suites learn about an app only through this contract.
 *   - `packages/application-foundation`: `defineTenantContract()` (P1-06) validates
 *     an app's contract with `TenantContract.parse`.
 *
 * Security rules encoded here (`.kiro/steering/security.md`):
 *   - every tenant table is scoped by `org_id` with RLS enabled and forced;
 *   - permissions are explicit names, so wildcards such as `*` cannot be declared;
 *   - roles may only grant permissions the contract declares, so an unknown
 *     permission is a contract error rather than an implicit grant.
 */
import { z } from 'zod';
import { RepoRelativePath, Slug, SqlIdentifier } from './common.js';

/** Permission name in `resource.verb` form, for example `tickets.read`. */
export const PermissionName = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'expected a permission such as tickets.read');
export type PermissionName = z.infer<typeof PermissionName>;

/** Role name, for example `agent` or `org_admin`. */
export const RoleName = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,39}$/, 'expected a lowercase role name');
export type RoleName = z.infer<typeof RoleName>;

/** A table that holds tenant data. */
export const TenantTable = z.strictObject({
  name: SqlIdentifier,
  /** Tenant column. Always `org_id`, as required by `tenantTable()`. */
  orgColumn: z.literal('org_id'),
  primaryKey: SqlIdentifier,
  /** Row-level security must be enabled and forced; anything else is rejected. */
  rls: z.strictObject({ enabled: z.literal(true), forced: z.literal(true) }),
});
export type TenantTable = z.infer<typeof TenantTable>;

export const ActionKind = z.enum(['read', 'list', 'create', 'update', 'delete', 'custom']);
export type ActionKind = z.infer<typeof ActionKind>;

/** An HTTP route or server action the harness can call to exercise a table. */
export const TenantAction = z.strictObject({
  /** Stable id, for example `tickets.get`. */
  id: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/),
  permission: PermissionName,
  kind: ActionKind,
  table: SqlIdentifier,
  http: z.strictObject({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    /** Path template with `:param` segments, for example `/api/tickets/:id`. */
    path: z.string().regex(/^\/[A-Za-z0-9/_:.-]*$/, 'expected a path template starting with /'),
  }),
});
export type TenantAction = z.infer<typeof TenantAction>;

export const Role = z.strictObject({
  name: RoleName,
  permissions: z.array(PermissionName),
});
export type Role = z.infer<typeof Role>;

/**
 * How the harness gets test data into two organizations.
 * Open question for P1-06: whether `via-actions` alone is enough for every app.
 */
export const TenantFixtures = z.discriminatedUnion('strategy', [
  z.strictObject({ strategy: z.literal('via-actions') }),
  z.strictObject({ strategy: z.literal('seed-script'), script: RepoRelativePath }),
]);
export type TenantFixtures = z.infer<typeof TenantFixtures>;

export const TenantContract = z
  .strictObject({
    contractVersion: z.literal(1),
    app: Slug,
    permissions: z.array(PermissionName).min(1),
    roles: z.array(Role).min(1),
    tables: z.array(TenantTable).min(1),
    actions: z.array(TenantAction).min(1),
    fixtures: TenantFixtures,
  })
  .superRefine((c, ctx) => {
    const declared = new Set(c.permissions);
    const tables = new Set(c.tables.map((t) => t.name));
    const dup = <T>(xs: readonly T[]): T[] => xs.filter((x, i) => xs.indexOf(x) !== i);

    for (const p of dup(c.permissions))
      ctx.addIssue({ code: 'custom', path: ['permissions'], message: `duplicate permission ${p}` });
    for (const r of dup(c.roles.map((x) => x.name)))
      ctx.addIssue({ code: 'custom', path: ['roles'], message: `duplicate role ${r}` });
    for (const t of dup(c.tables.map((x) => x.name)))
      ctx.addIssue({ code: 'custom', path: ['tables'], message: `duplicate table ${t}` });
    for (const a of dup(c.actions.map((x) => x.id)))
      ctx.addIssue({ code: 'custom', path: ['actions'], message: `duplicate action ${a}` });
    for (const r of dup(c.actions.map((x) => `${x.http.method} ${x.http.path}`)))
      ctx.addIssue({ code: 'custom', path: ['actions'], message: `duplicate route ${r}` });

    c.roles.forEach((role, i) => {
      role.permissions.forEach((p, j) => {
        if (!declared.has(p))
          ctx.addIssue({
            code: 'custom',
            path: ['roles', i, 'permissions', j],
            message: `role ${role.name} grants undeclared permission ${p}`,
          });
      });
    });
    c.actions.forEach((a, i) => {
      if (!declared.has(a.permission))
        ctx.addIssue({
          code: 'custom',
          path: ['actions', i, 'permission'],
          message: `action ${a.id} uses undeclared permission ${a.permission}`,
        });
      if (!tables.has(a.table))
        ctx.addIssue({
          code: 'custom',
          path: ['actions', i, 'table'],
          message: `action ${a.id} targets undeclared table ${a.table}`,
        });
    });
  });
export type TenantContract = z.infer<typeof TenantContract>;
