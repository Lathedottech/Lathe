export { auditEvents, memberships, organizations } from './db/schema.js';
export type {
  AuditEvent,
  Membership,
  NewAuditEvent,
  NewMembership,
  NewOrganization,
  Organization,
} from './db/schema.js';
export { runMigrations, type MigrateOptions } from './db/migrate.js';
export {
  parseOrgId,
  parseUserId,
  registeredTenantTables,
  tenantTable,
  withTenant,
  withUser,
  type OrgId,
  type TenantTx,
  type UserId,
} from './tenancy/index.js';

export const PACKAGE_NAME = '@lathe/application-foundation';

export function packageName(): string {
  return PACKAGE_NAME;
}
