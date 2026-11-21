import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from '../db/columns.js';
import { organizations } from '../db/organizations.js';

/**
 * Tables used by Better Auth (task P1-03). Column keys are Better Auth's field
 * names; column names are snake_case. Created by migration 0003.
 *
 * These are not tenant tables (no `org_id`) and have no RLS: Better Auth must
 * read them before any user or org is known (sign-in by email, session by
 * token). Only the auth module queries them. See the P1-03 report.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  ...timestamps(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    /** Set only by the server after a membership check (task P1-04). Never client input. */
    activeOrgId: uuid('active_org_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

/** Credentials. For email and password, `password` holds the hash, never the password. */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps(),
  },
  (table) => [
    unique('accounts_provider_id_account_id_unique').on(table.providerId, table.accountId),
    index('accounts_user_id_idx').on(table.userId),
  ],
);

export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

export const rateLimits = pgTable('rate_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
