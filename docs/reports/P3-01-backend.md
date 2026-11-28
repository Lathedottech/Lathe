# Report: P3-01 Engine schema and spec/plan types (backend, person A)

## 1. Objective completed
P3-01, **completed, pending review**. New package `services/factory-engine`: SQL migration with 8 tenant tables under forced RLS, Drizzle definitions, spec and plan validation with clear errors.

## 2. Files
`services/factory-engine/` (package.json, tsconfig, two Vitest configs, `migrations/1000_engine_core.sql`, `src/db/{schema,migrations,test-db,integration-setup}.ts`, `src/db/engine.integration.test.ts`, `src/domain/{spec,plan,validated}.ts`, `src/domain/domain.test.ts`, `src/index.ts`). Root `pnpm-workspace.yaml`, `vitest.config.ts`, `pnpm-lock.yaml`. `packages/application-foundation/package.json`: added `exports` (see 6).

## 3. Decisions
| Decision | Rejected | Reason |
|---|---|---|
| Engine tables in the same database as the foundation, after its migrations | A separate database | Operator auth (P3-04) reuses the foundation's users, orgs and `withTenant` |
| Every engine table is a tenant table (`org_id`, forced RLS) | Engine tables without RLS | Operators belong to orgs; same rules as apps (`security.md`) |
| Composite foreign keys `(parent_id, org_id)` | Plain foreign keys | A row can never point at a parent in another org, even if a query forgets the org |
| `run_events`, `gate_results`, `approvals` append-only for the app role | App-level only | Evidence must not be editable |
| Fix #19: FKs from `run_events`, `gate_results`, `runs`, `plans`, `specs` to their parents, and every `org_id` FK to `organizations` (8 tables), are `ON DELETE RESTRICT`; `REVOKE DELETE` on `runs`, `specs`, `plans`, `projects` from the app role. Edited in `1000_engine_core.sql` in place | A new `1001` migration | `1000` was never merged to main or applied anywhere, so a patch migration would only preserve the buggy history |
| `runs` CHECKs: fault injection only on demo runs and only `drop-tenant-filter`; repair attempts 0 to 3; known states | App-level only | The database refuses what contract C4 forbids |
| Spec `targetPaths` must lie inside `apps/<targetApp>/`; plan task paths inside the spec's target paths | Free paths | An agent can never be aimed at the harness, CI or another app |
| `PlanDraft` (tasks only) for planner output | C4 `Plan` | Ids, hashes and status are the Engine's, never the agent's |

## 4. Tests executed
1. `pnpm install --no-frozen-lockfile` then `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint` (eslint plus import boundaries)
4. `pnpm test`
5. `pnpm exec prettier --check services packages`
6. `pnpm test:integration` in `services/factory-engine` against a fresh Postgres database (container `lathe-fix-pg`, migrations applied from scratch). Fix #19 added `append-only.integration.test.ts` and `append-only-preservation.integration.test.ts`.

## 5. Results
- Both installs: exit 0 (lockfile updated, then frozen check passes).
- `pnpm typecheck`: exit 0 (6 projects including `services/factory-engine`).
- `pnpm lint`: exit 0, no dependency violations (122 modules).
- `pnpm test`: exit 0, 17 files passed, 214 tests passed, 0 failed.
- prettier check on `services packages`: exit 0 after `prettier --write` on the engine files.
- `pnpm test:integration` (fresh DB `lathe_fix_c`): exit 0, 3 files, 20 tests passed. The two append-only files: 13 tests passed (includes the new own-org `DELETE FROM organizations` case) (bug-condition test failed before the fix, passes after).
- Fix #19 re-check: install and typecheck exit 0; `pnpm test` 17 files, 214 tests passed. Lint and prettier errors in the two append-only test files are fixed (a `must()` helper replaces `!`; assertions unchanged). Final: `pnpm typecheck`, `pnpm lint` (124 modules, no violations), `pnpm test` (17 files, 214 tests) and `pnpm exec prettier --check services docs` all exit 0.

## 6. Remaining issues
- `packages/application-foundation/package.json` had no `exports`, so no package could import the foundation. One field added; B owns that file and should confirm.
- Locally, re-running the foundation's integration tests after the engine migrations may fail its catalog test (tables with `org_id` not created by `tenantTable()` in that process). CI runs the foundation first on a fresh database.
- The bootstrap default privileges give the app role DELETE on `organizations` (foundation, unchanged). The engine tables' `org_id` FKs are now `ON DELETE RESTRICT`, so an app-role delete of an org that owns engine rows is refused (23503) and evidence survives (tested). Follow-up for B (foundation owner) and security: the foundation's DELETE grant on `organizations` itself. Engine integration tests no longer delete orgs or approver users in `afterAll` (refused by design); they leave rows in the throwaway test DB.
- Evidence store and approvals logic are P3-03; the run state machine is P3-02.

## 7. Blockers
None.

## 8. Next task
P3-02 run state machine.
