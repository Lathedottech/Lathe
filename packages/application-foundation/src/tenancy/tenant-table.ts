import type { BuildExtraConfigColumns } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  type PgColumnBuilderBase,
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';
import { organizations } from '../db/organizations.js';

function orgIdColumn() {
  return uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });
}

type WithOrg<TColumns> = Omit<TColumns, 'orgId'> & { orgId: ReturnType<typeof orgIdColumn> };

const registry = new Set<string>();

/**
 * Defines a tenant table. Always adds `org_id NOT NULL` referencing
 * `organizations`, so a tenant table cannot forget its tenant column.
 *
 * The Drizzle definition does not create the RLS policy. Each tenant table also
 * needs, in a SQL migration: `ENABLE` and `FORCE ROW LEVEL SECURITY` and a policy
 * on `app_current_org_id()` (see migration 0002 for the pattern). The integration
 * test `every tenant table has forced RLS` fails for any table registered here
 * without it.
 */
export function tenantTable<
  TName extends string,
  TColumns extends Record<string, PgColumnBuilderBase>,
>(
  name: TName,
  columns: TColumns,
  extraConfig?: (
    self: BuildExtraConfigColumns<TName, WithOrg<TColumns>, 'pg'>,
  ) => PgTableExtraConfigValue[],
) {
  if ('orgId' in columns) {
    throw new Error(`tenantTable(${name}): do not declare orgId, it is added automatically`);
  }
  registry.add(name);
  const all = { ...columns, orgId: orgIdColumn() } as WithOrg<TColumns>;
  return extraConfig ? pgTable(name, all, extraConfig) : pgTable(name, all);
}

/** Names of every table defined with `tenantTable()` in this process. */
export function registeredTenantTables(): readonly string[] {
  return [...registry].sort();
}
