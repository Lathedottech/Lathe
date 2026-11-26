import { boolean, integer, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenantTable, users } from '@lathe/application-foundation';

/**
 * Factory Engine tables (task P3-01). Migration `migrations/1000_engine_core.sql`
 * is the source of truth, including RLS, composite same-org foreign keys and
 * CHECK constraints; these definitions give typed queries. Every table is a
 * tenant table created with `tenantTable()` (adds `org_id`).
 */
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const projects = tenantTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  targetApp: text('target_app').notNull(),
  repoOwner: text('repo_owner'),
  repoName: text('repo_name'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const specs = tenantTable(
  'specs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull(),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    contentSha256: text('content_sha256').notNull(),
    status: text('status').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('specs_project_id_version_unique').on(t.projectId, t.version)],
);

export const plans = tenantTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  specId: uuid('spec_id').notNull(),
  contentSha256: text('content_sha256').notNull(),
  status: text('status').notNull(),
  createdAt: createdAt(),
});

export const planTasks = tenantTable('plan_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull(),
  key: text('key').notNull(),
  title: text('title').notNull(),
  paths: text('paths').array().notNull(),
  acceptanceChecks: text('acceptance_checks').array().notNull(),
  dependsOn: text('depends_on').array().notNull().default([]),
});

export const runs = tenantTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull(),
  specId: uuid('spec_id').notNull(),
  planId: uuid('plan_id'),
  state: text('state').notNull(),
  demo: boolean('demo').notNull().default(false),
  faultInjection: text('fault_injection'),
  repairAttempts: integer('repair_attempts').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const runEvents = tenantTable('run_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull(),
  seq: integer('seq').notNull(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const gateResults = tenantTable('gate_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull(),
  attempt: integer('attempt').notNull(),
  gate: text('gate').notNull(),
  status: text('status').notNull(),
  resultHash: text('result_hash').notNull(),
  report: jsonb('report').notNull(),
  createdAt: createdAt(),
});

export const approvals = tenantTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  subjectType: text('subject_type').notNull(),
  subjectId: uuid('subject_id').notNull(),
  contentSha256: text('content_sha256').notNull(),
  decision: text('decision').notNull(),
  approverId: uuid('approver_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Every engine table, for the RLS checks. */
export const ENGINE_TABLES = [
  'projects',
  'specs',
  'plans',
  'plan_tasks',
  'runs',
  'run_events',
  'gate_results',
  'approvals',
] as const;

/** Tables the app role may only insert into and read (evidence-like). */
export const APPEND_ONLY_TABLES = ['run_events', 'gate_results', 'approvals'] as const;
