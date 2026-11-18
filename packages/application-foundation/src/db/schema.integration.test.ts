import { randomUUID } from 'node:crypto';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents, memberships, organizations } from './schema.js';
import { connectAs, expectPgError, roleName } from './test-db.js';

// PostgreSQL error codes.
const INSUFFICIENT_PRIVILEGE = '42501';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

let app: pg.Client;
const createdOrgIds: string[] = [];
const requestId = randomUUID();

beforeAll(async () => {
  app = await connectAs('app');
});

afterAll(async () => {
  // Audit rows are append-only by design and stay; they are tagged with requestId.
  for (const orgId of createdOrgIds) {
    await inOrg(orgId, () => app.query('DELETE FROM organizations WHERE id = $1', [orgId]));
  }
  await app?.end();
});

/**
 * Runs `fn` in a transaction scoped to `orgId`, the way `withTenant` does, using
 * raw SQL so these schema tests do not depend on the tenancy module.
 */
async function inOrg<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  await app.query('BEGIN');
  try {
    await app.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
    const result = await fn();
    await app.query('COMMIT');
    return result;
  } catch (error) {
    await app.query('ROLLBACK');
    throw error;
  }
}

async function createOrg(name: string): Promise<string> {
  const id = randomUUID();
  await inOrg(id, () =>
    app.query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [id, name]),
  );
  createdOrgIds.push(id);
  return id;
}

async function insertAudit(orgId: string, outcome: string): Promise<string> {
  return inOrg(orgId, async () => {
    const result = await app.query<{ id: string }>(
      `INSERT INTO audit_events (org_id, action, resource_type, outcome, request_id)
       VALUES ($1, 'test.write', 'test', $2, $3) RETURNING id`,
      [orgId, outcome, requestId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('audit insert returned no id');
    return id;
  });
}

describe('database roles', () => {
  it.each(['owner', 'app'] as const)(
    '%s role is not superuser and cannot bypass RLS',
    async (r) => {
      const result = await app.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
        'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1',
        [roleName(r)],
      );
      expect(result.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    },
  );

  it('app role owns no table', async () => {
    const result = await app.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user",
    );
    expect(result.rows).toEqual([]);
  });

  it('app role cannot create tables', async () => {
    const code = await expectPgError(() => app.query('CREATE TABLE p1_01_should_fail (id int)'));
    expect(code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('app role cannot read or write the migrations table', async () => {
    const code = await expectPgError(() => app.query('SELECT name FROM schema_migrations'));
    expect(code).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe('schema matches the Drizzle definition', () => {
  const tables: PgTable[] = [organizations, memberships, auditEvents];

  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))(
    '%s has the same columns, types and nullability',
    async (name, table) => {
      const expected = getTableConfig(table)
        .columns.map((c) => ({ column: c.name, type: c.getSQLType(), notNull: c.notNull }))
        .sort((a, b) => a.column.localeCompare(b.column));

      const actual = await app.query<{ column: string; type: string; notNull: boolean }>(
        `SELECT column_name AS column, data_type AS type, is_nullable = 'NO' AS "notNull"
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY column_name`,
        [name],
      );
      expect(actual.rows).toEqual(expected);
    },
  );
});

describe('audit_events is append-only for the app role', () => {
  it('allows INSERT and SELECT', async () => {
    const orgId = await createOrg('p1-01 audit read');
    const id = await insertAudit(orgId, 'allowed');
    const result = await inOrg(orgId, () =>
      app.query('SELECT outcome FROM audit_events WHERE id = $1', [id]),
    );
    expect(result.rows).toEqual([{ outcome: 'allowed' }]);
  });

  it('denies UPDATE', async () => {
    const orgId = await createOrg('p1-01 audit update');
    const id = await insertAudit(orgId, 'allowed');
    const code = await expectPgError(() =>
      inOrg(orgId, () =>
        app.query("UPDATE audit_events SET outcome = 'denied' WHERE id = $1", [id]),
      ),
    );
    expect(code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('denies DELETE', async () => {
    const orgId = await createOrg('p1-01 audit delete');
    const id = await insertAudit(orgId, 'allowed');
    const code = await expectPgError(() =>
      inOrg(orgId, () => app.query('DELETE FROM audit_events WHERE id = $1', [id])),
    );
    expect(code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('rejects an unknown outcome', async () => {
    const orgId = await createOrg('p1-01 audit outcome');
    const code = await expectPgError(() => insertAudit(orgId, 'maybe'));
    expect(code).toBe(CHECK_VIOLATION);
  });
});

describe('memberships constraints', () => {
  it('rejects a duplicate membership for the same org and user', async () => {
    const orgId = await createOrg('p1-01 duplicate test');
    const userId = randomUUID();
    const insert = () =>
      inOrg(orgId, () =>
        app.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'member')", [
          orgId,
          userId,
        ]),
      );
    await insert();
    expect(await expectPgError(insert)).toBe(UNIQUE_VIOLATION);
  });

  it('rejects a membership in an organization that does not exist', async () => {
    const missingOrg = randomUUID();
    const code = await expectPgError(() =>
      inOrg(missingOrg, () =>
        app.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'member')", [
          missingOrg,
          randomUUID(),
        ]),
      ),
    );
    expect(code).toBe(FOREIGN_KEY_VIOLATION);
  });
});
