# P1-02 Tenancy with RLS (backend)

Person: B. Branch: `task/P1-02-tenancy-rls`, based on `task/P1-01-schema-audit` at `569b65f` (P1-01 is reported, review pending). Date: 2026-11-18.

## 1. Objective completed

P1-02, **completed, pending security and architect review**. `tenantTable()` and `withTenant(orgId, fn)` exist. Migration 0002 enables and forces row-level security on `memberships`, `organizations` and `audit_events`. Integration tests on PostgreSQL 16, run as the non-owner app role, cover: no context returns zero rows, wrong org returns zero rows, writes with another org's `org_id` are rejected, context does not leak between transactions on a pooled connection, and concurrent transactions stay apart. Three deliberate mutations show the tests can fail.

Added beyond the task text, for review: `withUser(userId, fn)` and a migration runner (sections 3 and 6).

## 2. Files created or modified

New:
- `src/tenancy/tenant-table.ts`: `tenantTable()`, `registeredTenantTables()`.
- `src/tenancy/with-tenant.ts`: `withTenant()`, `withUser()`, `TenantTx`.
- `src/tenancy/ids.ts`: branded `OrgId`, `UserId`, `parseOrgId()`, `parseUserId()`.
- `src/tenancy/index.ts`: module exports.
- `src/tenancy/tenancy.integration.test.ts`: 26 integration tests.
- `src/tenancy/ids.test.ts`: 7 unit tests.
- `migrations/0002_tenancy_rls.sql`: helper functions, RLS and policies.
- `src/db/migrate.ts`: forward-only migration runner.
- `src/db/integration-setup.ts`: Vitest global setup that applies pending migrations.
- `src/db/columns.ts`, `src/db/organizations.ts`: split out so `tenantTable()` can reference `organizations` without an import cycle.

Modified:
- `src/db/schema.ts`: `memberships` is defined with `tenantTable()`; new index `memberships_user_id_idx`; Drizzle extra config uses the array form (the object form is deprecated).
- `src/db/schema.integration.test.ts`: the P1-01 tests now set an org context, because the tables are under RLS. Same assertions, plus one new test (app role cannot read `schema_migrations`).
- `src/db/test-db.ts`: `createPool()`, `createDb()`; `expectPgError()` follows `cause`, because Drizzle wraps driver errors.
- `vitest.integration.config.ts`: `globalSetup` runs the migrations.
- `migrations/0001_initial.sql`: header comment only (how it is applied). SQL unchanged.
- `src/index.ts`: exports the tenancy API and `runMigrations`.

All paths are under `packages/application-foundation/`. No new dependency.

## 3. Technical decisions

- **`set_config('app.org_id', $1, true)` instead of `SET LOCAL app.org_id = ...`.** They do the same thing (the setting ends with the transaction), but `SET` cannot take a bind parameter, so `SET LOCAL` would need string-built SQL. Rejected: `SET LOCAL` with escaping.
- **Policies read the setting through `app_current_org_id()`, which wraps it in `NULLIF(..., '')`.** After a transaction that set the value, `current_setting()` returns `''` instead of NULL, and `''::uuid` raises an error. With `NULLIF`, missing context is NULL, `org_id = NULL` is never true, and every policy fails closed. Rejected: `current_setting()` used directly in each policy.
- **`withUser(userId, fn)` and a self-read policy on `memberships` (`user_id = app_current_user_id()`, SELECT only).** Login and org switching (P1-04) must read a user's memberships before any org is chosen, and under RLS nothing is readable without an org. `withUser` sets only `app.user_id`; it can read the user's own memberships and the organizations they belong to, and nothing else. Each function clears the other's setting, so they cannot combine. Rejected: a `SECURITY DEFINER` function (runs with owner rights, bigger blast radius if wrong) and the app role reading memberships without RLS. **Needs person A's confirmation**, since it shapes P1-04.
- **RLS also on `organizations` and `audit_events`.** Neither can be a C1 `TenantTable` (contract question Q3), so without RLS here they would be readable across orgs. `organizations`: readable and writable only for the current org, readable by members through `withUser`. `audit_events`: readable only for the current org; inserts allowed for the current org or with no org; no UPDATE or DELETE policy, on top of the missing grants. Rejected: leaving them for P1-04 and P1-05.
- **Creating an organization means choosing its id first** and inserting the org and its first membership in `withTenant(newId)`. This is the only way to pass the `WITH CHECK` on `organizations` without a bypass.
- **`tenantTable()` keeps a registry, and two tests use the database catalog.** One fails if a registered table lacks forced RLS or has no policy. The other fails if any table has a `NOT NULL org_id` column but was not created through `tenantTable()`. Rejected: generating RLS from Drizzle (`.enableRLS()` cannot express `FORCE`, and migrations stay hand-written SQL, as in P1-01).
- **Branded ids, validated as UUIDs** before they reach the database (`engineering-standards.md`). A non-UUID org id is rejected without a query.
- **Migration runner** (`runMigrations`): applies `migrations/*.sql` in name order as the owner role, one transaction per file, records them in `schema_migrations` (no app role access), and takes an advisory lock so two runners cannot overlap. It replaces `:"app_role"` with the quoted role name, so 0001 runs unchanged. Rejected: drizzle-kit migrate (P1-01 decision: hand-written SQL), and applying by hand with `psql` (P1-01 remaining issue).

## 4. Tests executed

Windows, Node v24.14.0, pnpm 9.15.9, Docker 26.0.0, `postgres:16` on port 5433.

```powershell
# fresh path: the empty P1-01 tables were dropped so the runner applies 0001 and 0002 from zero
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm format:check
# mutations, each run with: pnpm --filter @lathe/application-foundation exec vitest run --config vitest.integration.config.ts
docker exec infra-postgres-1 psql -U postgres -d lathe -c "ALTER TABLE memberships DISABLE ROW LEVEL SECURITY;"
docker exec infra-postgres-1 psql -U postgres -d lathe -c "ALTER TABLE memberships ENABLE ROW LEVEL SECURITY; ALTER TABLE memberships NO FORCE ROW LEVEL SECURITY;"
# code mutation in with-tenant.ts: set_config('app.org_id', ${id}, true) -> false (session-level, leaks)
# then everything restored and the full suite re-run
```

## 5. Test results

First integration run: `migrations applied: 0001_initial.sql, 0002_tenancy_rls.sql`.

| Command | Result | Exit |
|---|---|---|
| `pnpm typecheck` | both packages `Done` | 0 |
| `pnpm lint` | no findings | 0 |
| `pnpm test` | `Tests 9 passed (9)` (2 smoke, 7 id parsing) | 0 |
| `pnpm test:integration` | `Test Files 2 passed (2)`, `Tests 41 passed (41)` | 0 |
| `pnpm format:check` | all files formatted | 0 |

The 41 integration tests: 15 from P1-01 (adapted), 26 new. New ones, all as `lathe_app`:
- RLS: every `tenantTable()` table has forced RLS and a policy; every table with `NOT NULL org_id` is registered; `organizations` and `audit_events` have forced RLS.
- No context: zero rows from `memberships`, `organizations`, `audit_events`; membership insert rejected (`42501`).
- `withTenant`: sees only its org's memberships; cannot read another org's membership by id; sees only its own organization; cannot read another org's audit events; update and delete of another org's row affect 0 rows and the row is unchanged; insert with another org's `org_id` rejected (`42501`); moving a row to another org rejected (`42501`); audit event for another org rejected (`42501`); non-UUID org id rejected before any query.
- Leaks (pool of 1 connection, so the next query reuses it): context empty after commit and zero rows visible; context empty and write rolled back after `fn` throws; 30 concurrent `withTenant` calls alternating orgs on a pool of 3 each see only their org.
- `withUser`: lists the user's own memberships in both orgs and nobody else's; sees only the user's organizations; cannot insert memberships (`42501`); cannot change their own role (0 rows); sees no audit events; context cleared afterwards; `withTenant` never inherits a user context.

Mutations (each restored afterwards):

| Mutation | Result |
|---|---|
| `DISABLE ROW LEVEL SECURITY` on `memberships` | `Tests 13 failed \| 28 passed (41)`: the RLS check, every no-context, isolation and `withUser` test on memberships |
| `NO FORCE ROW LEVEL SECURITY` on `memberships` | `Tests 1 failed \| 40 passed (41)`: `every table defined with tenantTable() has forced RLS and a policy`. Only this test can catch it, because the app role is not the owner |
| `set_config(..., false)` in `withTenant` (session-level context) | `Tests 7 failed \| 34 passed (41)`: the no-context tests and all three leak tests |

After restoring: 41 passed, and `pg_class` shows `relrowsecurity` and `relforcerowsecurity` true on all three tables.

## 6. Remaining issues

- **`withUser` trusts the `userId` it is given.** It must come from the authenticated session (P1-03), never from request input, as `withTenant`'s org must come from the membership (P1-04). Nothing enforces that yet; `defineAction` (P1-05) will be the only caller.
- **The owner role is now also subject to RLS** (that is what `FORCE` means). Maintenance as the owner needs an org context or a superuser. Migrations are DDL and are not affected.
- **Audit rows with no org cannot be read back by the app** (inserted with no `RETURNING`). Reading them is an operator task for later.
- **The registry knows only tables imported in the current process.** The catalog test covers the gap for this package. Each app's tests must import its schema for its tables to be checked.
- **`organizations_member_read` uses a subquery on `memberships`.** Fine at MVP size, indexed on `user_id`.
- **The P1-01 integration tests changed** to work under RLS. P1-01's reviewer should know this branch changes them.
- **Local database**: the empty P1-01 tables were dropped to test the runner from zero. Only local, no data.
- **CI does not run integration tests yet** (P0-06 follow-up, after P1-01 merges).
- Not run on Node 22.

## 7. Dependencies or blockers

- P1-01 is not Done (review pending). If its review changes the schema, this branch must be rebased.
- Review: `security` and `architect` (task-ownership.md), plus a diff read by person A (security-critical). `src/tenancy/` is a CODEOWNERS path.
- Person A to confirm the `withUser` design before P1-04 relies on it.

## 8. Recommended next task

P1-03 authentication (Better Auth), which gives `withUser` a trusted user id. Then P1-04, which uses `withUser` to list a user's orgs and `withTenant` to act in one.
