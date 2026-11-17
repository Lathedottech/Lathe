export { auditEvents, memberships, organizations } from './db/schema.js';
export type {
  AuditEvent,
  Membership,
  NewAuditEvent,
  NewMembership,
  NewOrganization,
  Organization,
} from './db/schema.js';

export const PACKAGE_NAME = '@lathe/application-foundation';

export function packageName(): string {
  return PACKAGE_NAME;
}
