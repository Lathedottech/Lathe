import type { DemoSeed } from '@lathe/application-foundation';
import { APP_SLUG } from './app-slug';
import { authz, type AppRole } from './authz';

/**
 * Two orgs (a and b) with one test principal per role in each, as the tenant
 * contract (C1) requires. Emails use the reserved `.test` domain and carry the
 * app name, so apps sharing a database do not collide. Org ids are fixed so a
 * re-run finds them. The password is never here: it comes from LATHE_TEST_PASSWORD.
 */
export { APP_SLUG };

export const SEED_ORGS = {
  a: { id: 'ded52ba4-077c-4352-936b-72517241a5b9', name: 'Org A' },
  b: { id: '8aa57b33-4f0b-4904-85d7-a6e15f298389', name: 'Org B' },
} as const;

export interface SeedPrincipal {
  readonly key: string;
  readonly email: string;
  readonly org: 'a' | 'b';
  readonly role: AppRole;
}

export const SEED_PRINCIPALS: readonly SeedPrincipal[] = (['a', 'b'] as const).flatMap((org) =>
  authz.roles.map((role) => ({
    key: `${org}-${role}`,
    email: `${role}@${APP_SLUG}-org-${org}.test`,
    org,
    role,
  })),
);

export function demoSeed(password: string): DemoSeed {
  return {
    orgs: SEED_ORGS,
    users: SEED_PRINCIPALS.map((p) => ({
      name: `${p.role} (${SEED_ORGS[p.org].name})`,
      email: p.email,
      memberOf: [{ org: p.org, role: p.role }],
    })),
    password,
  };
}
