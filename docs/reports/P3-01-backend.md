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
| `runs` CHECKs: fault injection only on demo runs and only `drop-tenant-filter`; repair attempts 0 to 3; known states | App-level only | The database refuses what contract C4 forbids |
| Spec `targetPaths` must lie inside `apps/<targetApp>/`; plan task paths inside the spec's target paths | Free paths | An agent can never be aimed at the harness, CI or another app |
| `PlanDraft` (tasks only) for planner output | C4 `Plan` | Ids, hashes and status are the Engine's, never the agent's |

## 4. Tests executed
1. `pnpm install --no-frozen-lockfile` then `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint` (eslint plus import boundaries)
4. `pnpm test`
5. `pnpm exec prettier --check services packages`
6. `pnpm test:integration`: **not run**. No root `.env` with Postgres and role variables exists locally, and the Docker daemon is not running. It runs in CI.

## 5. Results
- Both installs: exit 0 (lockfile updated, then frozen check passes).
- `pnpm typecheck`: exit 0 (6 projects including `services/factory-engine`).
- `pnpm lint`: exit 0, no dependency violations (122 modules).
- `pnpm test`: exit 0, 17 files passed, 214 tests passed, 0 failed.
- prettier check on `services packages`: exit 0 after `prettier --write` on the engine files.
- Integration tests: not run (see above), so RLS behaviour is unverified locally.

## 6. Remaining issues
- `packages/application-foundation/package.json` had no `exports`, so no package could import the foundation. One field added; B owns that file and should confirm.
- Locally, re-running the foundation's integration tests after the engine migrations may fail its catalog test (tables with `org_id` not created by `tenantTable()` in that process). CI runs the foundation first on a fresh database.
- Evidence store and approvals logic are P3-03; the run state machine is P3-02.

## 7. Blockers
None.

## 8. Next task
P3-02 run state machine.
