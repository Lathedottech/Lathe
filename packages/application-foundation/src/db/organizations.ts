import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './columns.js';

/**
 * The tenant itself. Has no `org_id`: its own `id` is the org.
 * RLS (migration 0002): visible inside `withTenant` for that org, or inside
 * `withUser` for orgs the user is a member of.
 */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ...timestamps(),
});
