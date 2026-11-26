import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organizations, parseOrgId, withTenant, type OrgId } from '@lathe/application-foundation';
import { APPEND_ONLY_TABLES, ENGINE_TABLES, projects, runEvents, runs, specs } from './schema.js';
import { connectAs, createPool, expectPgError } from './test-db.js';

const SHA = 'a'.repeat(64);
let pool: pg.Pool;
let db: NodePgDatabase;
const orgA = parseOrgId(randomUUID());
const orgB = parseOrgId(randomUUID());

async function newOrg(id: OrgId, name: string) {
  await withTenant(db, id, (tx) => tx.insert(organizations).values({ id, name }));
}
async function newProject(org: OrgId, slug: string) {
  return withTenant(db, org, async (tx) => {
    const [p] = await tx
      .insert(projects)
      .values({ orgId: org, name: slug, slug, targetApp: 'support-desk' })
      .returning();
    if (!p) throw new Error('no project');
    return p;
  });
}
async function newSpec(org: OrgId, projectId: string) {
  return withTenant(db, org, async (tx) => {
    const [s] = await tx
      .insert(specs)
      .values({
        orgId: org,
        projectId,
        version: 1,
        title: 'KB',
        body: 'Knowledge base',
        contentSha256: SHA,
        status: 'submitted',
      })
      .returning();
    if (!s) throw new Error('no spec');
    return s;
  });
}

beforeAll(async () => {
  pool = createPool('app', 3);
  db = drizzle({ client: pool });
  await newOrg(orgA, `P3-01 A ${orgA.slice(0, 8)}`);
  await newOrg(orgB, `P3-01 B ${orgB.slice(0, 8)}`);
});

afterAll(async () => {
  // Orgs that own engine rows cannot be deleted (ON DELETE RESTRICT), by design.
  await pool.end();
});

describe('engine tables', () => {
  it('have RLS enabled and forced, and a policy', async () => {
    const owner = await connectAs('owner');
    try {
      const rls = await owner.query<{
        relname: string;
        on: boolean;
        forced: boolean;
        policies: number;
      }>(
        `SELECT c.relname, c.relrowsecurity AS on, c.relforcerowsecurity AS forced,
                (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname) AS policies
         FROM pg_class c WHERE c.relname = ANY($1::text[]) AND c.relkind = 'r' ORDER BY 1`,
        [[...ENGINE_TABLES]],
      );
      expect(rls.rows.map((r) => r.relname)).toEqual([...ENGINE_TABLES].sort());
      for (const r of rls.rows)
        expect({ table: r.relname, on: r.on, forced: r.forced, hasPolicy: r.policies > 0 }).toEqual(
          { table: r.relname, on: true, forced: true, hasPolicy: true },
        );
    } finally {
      await owner.end();
    }
  });

  it('are append-only for the app role where they hold evidence', async () => {
    const owner = await connectAs('owner');
    try {
      const grants = await owner.query<{ table_name: string; privilege_type: string }>(
        `SELECT table_name, privilege_type FROM information_schema.role_table_grants
         WHERE grantee = current_setting('lathe.app_role', true) OR grantee = $1`,
        [process.env['LATHE_DB_APP_ROLE']],
      );
      for (const t of APPEND_ONLY_TABLES) {
        const privs = grants.rows
          .filter((g) => g.table_name === t)
          .map((g) => g.privilege_type)
          .sort();
        expect({ table: t, privs }).toEqual({ table: t, privs: ['INSERT', 'SELECT'] });
      }
    } finally {
      await owner.end();
    }
  });
});

describe('tenant isolation', () => {
  it('without an org context the app role sees nothing and cannot insert', async () => {
    const seen = await db.transaction((tx) => tx.select().from(projects));
    expect(seen).toEqual([]);
    expect(
      await expectPgError(() =>
        db
          .insert(projects)
          .values({ orgId: orgA, name: 'x', slug: 'no-context', targetApp: 'support-desk' }),
      ),
    ).toBe('42501');
  });

  it('a project of org A is invisible and unchangeable from org B', async () => {
    const p = await newProject(orgA, 'iso-a');
    const fromB = await withTenant(db, orgB, (tx) =>
      tx.select().from(projects).where(eq(projects.id, p.id)),
    );
    expect(fromB).toEqual([]);
    const updated = await withTenant(db, orgB, (tx) =>
      tx.update(projects).set({ name: 'hijacked' }).where(eq(projects.id, p.id)).returning(),
    );
    expect(updated).toEqual([]);
    const still = await withTenant(db, orgA, (tx) =>
      tx.select().from(projects).where(eq(projects.id, p.id)),
    );
    expect(still[0]?.name).toBe('iso-a');
  });

  it('a spec in org B cannot point at a project of org A', async () => {
    const p = await newProject(orgA, 'cross-a');
    const code = await expectPgError(() => newSpec(orgB, p.id));
    expect(code).toBe('23503');
  });
});

describe('run rules', () => {
  it('fault injection is only allowed on a demo run, and repair attempts stop at 3', async () => {
    const p = await newProject(orgA, 'runs-a');
    const s = await newSpec(orgA, p.id);
    const insert = (values: Partial<typeof runs.$inferInsert>) =>
      withTenant(db, orgA, (tx) =>
        tx
          .insert(runs)
          .values({ orgId: orgA, projectId: p.id, specId: s.id, state: 'DEFINED', ...values }),
      );
    expect(await expectPgError(() => insert({ faultInjection: 'drop-tenant-filter' }))).toBe(
      '23514',
    );
    expect(await expectPgError(() => insert({ demo: true, faultInjection: 'disable-rls' }))).toBe(
      '23514',
    );
    expect(await expectPgError(() => insert({ repairAttempts: 4 }))).toBe('23514');
    expect(await expectPgError(() => insert({ state: 'PASSED' }))).toBe('23514');
    await insert({ demo: true, faultInjection: 'drop-tenant-filter' });
  });

  it('run events are append-only and ordered per run', async () => {
    const p = await newProject(orgA, 'events-a');
    const s = await newSpec(orgA, p.id);
    const run = await withTenant(db, orgA, async (tx) => {
      const [r] = await tx
        .insert(runs)
        .values({ orgId: orgA, projectId: p.id, specId: s.id, state: 'DEFINED' })
        .returning();
      if (!r) throw new Error('no run');
      await tx.insert(runEvents).values({
        orgId: orgA,
        runId: r.id,
        seq: 0,
        type: 'state_changed',
        payload: { to: 'DEFINED' },
      });
      return r;
    });
    expect(
      await expectPgError(() =>
        withTenant(db, orgA, (tx) =>
          tx
            .insert(runEvents)
            .values({ orgId: orgA, runId: run.id, seq: 0, type: 'state_changed', payload: {} }),
        ),
      ),
    ).toBe('23505');
    expect(
      await expectPgError(() =>
        withTenant(db, orgA, (tx) =>
          tx.update(runEvents).set({ type: 'tampered' }).where(eq(runEvents.runId, run.id)),
        ),
      ),
    ).toBe('42501');
  });
});
