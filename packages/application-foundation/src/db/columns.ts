import { timestamp } from 'drizzle-orm/pg-core';

/** `created_at` and `updated_at`, both set by the database. */
export function timestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  };
}
