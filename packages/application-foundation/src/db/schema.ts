import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/schema.js';
import { tenantTable } from '../tenancy/tenant-table.js';
import { timestamps } from './columns.js';
import { organizations } from './organizations.js';

export { organizations };

/** Tenant table. `user_id` references `users` (migration 0003). */
export const memberships = tenantTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('memberships_org_id_user_id_unique').on(table.orgId, table.userId),
    index('memberships_org_id_idx').on(table.orgId),
    index('memberships_user_id_idx').on(table.userId),
  ],
);

/**
 * Append-only. `org_id` is nullable because a request denied before membership
 * resolution has no org. Under RLS, rows are readable only inside `withTenant`
 * for their org; rows without an org can be inserted but not read back, so do not
 * use `RETURNING` when inserting them.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id'),
    orgId: uuid('org_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    outcome: text('outcome').notNull(),
    requestId: uuid('request_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_org_id_idx').on(table.orgId),
    index('audit_events_request_id_idx').on(table.requestId),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
