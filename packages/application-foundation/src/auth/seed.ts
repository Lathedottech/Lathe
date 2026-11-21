import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { memberships, organizations } from '../db/schema.js';
import { parseOrgId, parseUserId, type OrgId, type UserId } from '../tenancy/ids.js';
import { withTenant } from '../tenancy/with-tenant.js';
import type { Auth } from './auth.js';

export interface DemoUser {
  readonly name: string;
  readonly email: string;
  /** Org key from `DemoSeed.orgs`, and the role the user has there. */
  readonly memberOf: readonly { readonly org: string; readonly role: string }[];
}

export interface DemoSeed {
  /** Org key to `{ id, name }`. Ids are chosen up front so the org can be inserted under RLS. */
  readonly orgs: Readonly<Record<string, { readonly id: string; readonly name: string }>>;
  readonly users: readonly DemoUser[];
  /** Shared demo password, from the environment. Never hard-coded. */
  readonly password: string;
}

export interface SeededUser {
  readonly email: string;
  readonly userId: UserId;
}

/**
 * Creates demo organizations, users and memberships. `auth` must allow sign-up
 * (`allowSignUp: true`); the running app's instance should not. Users are created
 * through Better Auth, so passwords are hashed exactly as on a real sign-up.
 */
export async function seedDemo(
  auth: Auth,
  db: NodePgDatabase<Record<string, unknown>>,
  seed: DemoSeed,
): Promise<SeededUser[]> {
  const orgIds = new Map<string, OrgId>();
  for (const [key, org] of Object.entries(seed.orgs)) {
    const id = parseOrgId(org.id);
    await withTenant(db, id, (tx) => tx.insert(organizations).values({ id, name: org.name }));
    orgIds.set(key, id);
  }

  const seeded: SeededUser[] = [];
  for (const user of seed.users) {
    const created = await auth.api.signUpEmail({
      body: { name: user.name, email: user.email, password: seed.password },
    });
    const userId = parseUserId(created.user.id);
    for (const m of user.memberOf) {
      const orgId = orgIds.get(m.org);
      if (!orgId) throw new Error(`demo user ${user.email} refers to unknown org ${m.org}`);
      await withTenant(db, orgId, (tx) =>
        tx.insert(memberships).values({ orgId, userId, role: m.role }),
      );
    }
    seeded.push({ email: created.user.email, userId });
  }
  return seeded;
}
