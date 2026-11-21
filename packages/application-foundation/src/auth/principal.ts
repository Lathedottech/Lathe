import { parseOrgId, parseUserId, type OrgId, type UserId } from '../tenancy/ids.js';
import type { Auth } from './auth.js';

/** The authenticated caller. The only trusted source of a user id. */
export interface Principal {
  readonly userId: UserId;
  readonly sessionId: string;
  /** Set by the server after a membership check (P1-04). `null` until an org is chosen. */
  readonly activeOrgId: OrgId | null;
}

/**
 * Reads the session cookie from `headers` and returns the signed-in user, or
 * `null` for no cookie, a forged or tampered cookie, an expired session, or a
 * signed-out session. Never throws for a bad cookie.
 *
 * `activeOrgId` is only a pointer. `defineAction` (P1-05) must still check the
 * membership before using it with `withTenant`.
 */
export async function getPrincipal(auth: Auth, headers: Headers): Promise<Principal | null> {
  const result = await auth.api.getSession({ headers });
  if (!result) return null;
  const activeOrgId: unknown = result.session.activeOrgId;
  return {
    userId: parseUserId(result.user.id),
    sessionId: result.session.id,
    activeOrgId: activeOrgId === null || activeOrgId === undefined ? null : parseOrgId(activeOrgId),
  };
}
