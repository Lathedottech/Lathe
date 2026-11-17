import { describe, expect, it } from 'vitest';
import { TenantContract } from './index.js';
import { at, clone as deepClone } from './test-fixtures.js';

const valid = {
  contractVersion: 1,
  app: 'support-desk',
  permissions: ['tickets.read', 'tickets.update'],
  roles: [
    { name: 'requester', permissions: ['tickets.read'] },
    { name: 'agent', permissions: ['tickets.read', 'tickets.update'] },
  ],
  tables: [
    {
      name: 'tickets',
      orgColumn: 'org_id',
      primaryKey: 'id',
      rls: { enabled: true, forced: true },
    },
  ],
  actions: [
    {
      id: 'tickets.get',
      permission: 'tickets.read',
      kind: 'read',
      table: 'tickets',
      http: { method: 'GET', path: '/api/tickets/:id' },
    },
    {
      id: 'tickets.update',
      permission: 'tickets.update',
      kind: 'update',
      table: 'tickets',
      http: { method: 'PATCH', path: '/api/tickets/:id' },
    },
  ],
  fixtures: { strategy: 'via-actions' },
};
const clone = (): typeof valid => deepClone(valid);

describe('C1 TenantContract', () => {
  it('accepts a valid contract', () => {
    expect(TenantContract.safeParse(valid).success).toBe(true);
  });
  it('rejects a role granting an undeclared permission', () => {
    const c = clone();
    at(c.roles, 0).permissions.push('tickets.delete');
    expect(TenantContract.safeParse(c).success).toBe(false);
  });
  it('rejects wildcard permissions', () => {
    const c = clone();
    c.permissions.push('*');
    expect(TenantContract.safeParse(c).success).toBe(false);
  });
  it('rejects an action on an undeclared table', () => {
    const c = clone();
    at(c.actions, 0).table = 'secrets';
    expect(TenantContract.safeParse(c).success).toBe(false);
  });
  it('rejects a table without forced RLS', () => {
    const c = deepClone({
      ...valid,
      tables: [{ ...at(valid.tables, 0), rls: { enabled: true, forced: false } }],
    });
    expect(TenantContract.safeParse(c).success).toBe(false);
  });
  it('rejects a tenant column other than org_id', () => {
    const c = deepClone({ ...valid, tables: [{ ...at(valid.tables, 0), orgColumn: 'tenant' }] });
    expect(TenantContract.safeParse(c).success).toBe(false);
  });
  it('rejects duplicate routes', () => {
    const c = clone();
    at(c.actions, 1).http = { method: 'GET', path: '/api/tickets/:id' };
    expect(TenantContract.safeParse(c).success).toBe(false);
  });
  it('rejects unknown keys', () => {
    expect(TenantContract.safeParse({ ...valid, bypassRls: true }).success).toBe(false);
  });
});
