import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { parseOrgId, parseUserId, type OrgId, type UserId } from './ids.js';

type Schema = Record<string, unknown>;

/** The transaction handle passed to the callback of `withTenant` and `withUser`. */
export type TenantTx<TSchema extends Schema = Schema> = Parameters<
  Parameters<NodePgDatabase<TSchema>['transaction']>[0]
>[0];

/**
 * Runs `fn` in one transaction scoped to `orgId`. RLS policies then show and
 * accept only rows of that org.
 *
 * The org is set with `set_config(..., true)`, the parameterized form of
 * `SET LOCAL`: it ends with the transaction, so a pooled connection never carries
 * it into the next request. `app.user_id` is cleared so the self-read policies of
 * `withUser` cannot widen what this transaction sees.
 *
 * `orgId` must come from the authenticated membership, never from request input.
 */
export async function withTenant<TSchema extends Schema, T>(
  db: NodePgDatabase<TSchema>,
  orgId: OrgId,
  fn: (tx: TenantTx<TSchema>) => Promise<T>,
): Promise<T> {
  const id = parseOrgId(orgId);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.org_id', ${id}, true), set_config('app.user_id', '', true)`,
    );
    return fn(tx);
  });
}

/**
 * Runs `fn` in one transaction with no org, as `userId`. RLS then shows only the
 * user's own memberships and the organizations they belong to, read-only. Used to
 * list a user's orgs and to check a membership before `withTenant` (task P1-04).
 * No tenant data is visible.
 */
export async function withUser<TSchema extends Schema, T>(
  db: NodePgDatabase<TSchema>,
  userId: UserId,
  fn: (tx: TenantTx<TSchema>) => Promise<T>,
): Promise<T> {
  const id = parseUserId(userId);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.user_id', ${id}, true), set_config('app.org_id', '', true)`,
    );
    return fn(tx);
  });
}
