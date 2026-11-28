import { tenantTable, users } from '@lathe/application-foundation';
import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Tenant tables of Team Operations (task P7-02). A team's and a project's id is its
 * foundation scope id; the composite foreign keys to `scopes`, the kind checks and the
 * grants are in `migrations/team-operations_0001_teams.sql`, the source of truth.
 */
export const teams = tenantTable('teams', {
  id: uuid('id').primaryKey(),
  scopeKind: text('scope_kind').notNull().default('team'),
  name: text('name').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = tenantTable('projects', {
  id: uuid('id').primaryKey(),
  teamId: uuid('team_id').notNull(),
  scopeKind: text('scope_kind').notNull().default('project'),
  name: text('name').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = tenantTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    status: text('status').notNull().default('todo').$type<TaskStatus>(),
    assigneeMembershipId: uuid('assignee_membership_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tasks_org_id_project_id_created_at_idx').on(t.orgId, t.projectId, t.createdAt, t.id),
  ],
);

export type TeamRow = typeof teams.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
