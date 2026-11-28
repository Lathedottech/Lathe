# P2-04 verification: tenant isolation suite

## 1. Objective completed
P2-04, **partially completed**. The suite, the gate wrapper and the planted-leak fixtures exist and pass their tests. The gate is **not** registered in `defaultGates`, so `lathe-verify` still reports `error` for `tenant-isolation`. No real app exists, so the suite has only been proven against a fixture app written for this task. Postgres integration was not run.

## 2. Files created or modified
Created:
- `packages/verification-harness/suites/tenant-isolation/run.ts` (the suite, driven by the C1 contract)
- `packages/verification-harness/suites/tenant-isolation/index.ts` (`tenantIsolationGate`, exports)
- `packages/verification-harness/suites/tenant-isolation/tenant-isolation.test.ts` (11 tests)
- `packages/verification-harness/fixtures/tenant-isolation/fixture-app.ts` (in-memory HTTP app, 1 good and 4 leaky variants, with a C1 contract)
- `docs/reports/P2-04-verification.md`

Modified: `packages/verification-harness/tsconfig.json` (include `suites`, `fixtures`), `packages/verification-harness/vitest.config.ts` (include `suites/**/*.test.ts`).

Merge: `origin/task/P1-06-tenant-contract` merged into `task/P2-04-tenant-isolation` (commit 981cf23). The only conflict was `pnpm-lock.yaml`. I took our side, ran `pnpm install --no-frozen-lockfile`, and then `pnpm install --frozen-lockfile` exited 0.

## 3. Technical decisions
- Suite is a library function `runTenantIsolation({ contract, baseUrl, password, runId })` that returns findings and a check count. Rejected: a suite that reads the app from the worktree itself, because starting the app is the Engine's job (P2-08) and is undefined today.
- `runId` is an input, not generated, so the run is reproducible and rows are identifiable. Rejected: random or time-based ids that would not be logged.
- Cross-org access must be exactly 404. A foreign row must also answer identically to a never-existing id (status and body, ids normalised). 403 fails.
- Org b attempts per principal of org b whose role holds the action's permission, so a denial from RBAC cannot mask a tenancy leak.
- Also checked: guessed neighbour id, no session, `org_id` forged in body, query and `x-org-id` header, org a's row unchanged afterwards, no `org_id` leak into org a's list.
- A tenant table with no create action, or no principal able to create, fails (`isolation/no-create-action`, `isolation/no-principal`). Zero checks evaluated fails (`isolation/no-checks`). Rejected: skipping, since a gate that cannot fail is a defect.
- Findings carry rule id, table and statuses only, never the password or response bodies (tested).
- Gate not wired into `registry.ts`, because it needs an app launcher. `tenantIsolationGate(resolve)` returns `error` if `resolve` throws.
- Seeded leaks: `missing-org-filter` (no filter, RLS off), `missing-rls-policy` (by-id access unscoped, list filtered), `org-from-input`, plus `forbidden-on-foreign` (403 reveals existence).

## 4. Tests executed
- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm lint` (eslint and import-boundary check)
- `pnpm test`
- `pnpm exec prettier --check packages`

## 5. Test results
- `pnpm test`: 25 files passed, 336 tests passed, 0 failed, exit 0. The 11 new tests are in `suites/tenant-isolation/tenant-isolation.test.ts`.
- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0 (no dependency violations, 141 modules). `prettier --check packages`: exit 0.
- First `pnpm test` run had 1 failure: my own test wrongly expected `isolation/no-checks` after a failed sign-in (sign-in attempts already count as checks). I corrected the test, not the suite. Second run passed.

## 6. Remaining issues
- **C1 v1 does not specify request and response shapes.** The suite assumes: sign-in is `POST` with JSON `{ email, password }` and sets cookies; create takes `{ label }` and answers JSON with `id` (and `org_id` when exposed); update takes `{ label }`; list answers 2xx. Real apps may differ. Needs a handoff to `architect` (for example a `label` field mapping or a `sample` payload per create action).
- `session.setActiveOrg` is not called, because each principal belongs to one org and the org must come from the membership.
- HTTP-level checks cannot see RLS itself. DB-level checks from `testing.md` (no tenant context gives zero rows, wrong context gives zero rows, no pooled-connection leak, app role lacks `BYPASSRLS`) are **not implemented**. They need real Postgres.
- Integration with real Postgres: **not run**. I did not check for Docker or Postgres environment, and the task allowed skipping.
- Gate is not in `defaultGates`; `tenant-isolation` still reports `error`. Registry wiring and an app launcher need a follow-up.
- Cleanup of created rows is best effort. Rows from a failed run in a real database stay, identified by `lathe-iso-<runId>-<table>`.
- Only `kind: 'tenant'` tables are exercised. `organizations` and `audit_events` are not.
- Only the first creator principal per org is used for creation. Other roles are used as attackers.

## 7. Dependencies or blockers
None blocking. A future real run depends on P1-06 apps exposing the conventions above and on P2-08 for launching an app.

## 8. Recommended next task
P2-05 (RBAC matrix and deny-by-default suite), and a handoff to `architect` on the request-shape conventions before the first real app is wired.

## Fix after review of PR #22 (second round)
- **Vacuous `isolation/org-from-input`:** the suite took org a's id from the create response, so an app that did not return `org_id` made the forged request carry a made-up id and nothing could be detected. Org ids now come from `orgIds` (the fixture seed, `FixtureServer.orgIds`), never from a response. Without `orgIds` the suite emits `isolation/org-id-unknown` and the gate fails. Before the fix, the leaky `org-from-input` app with `org_id` stripped from all responses produced no finding (test failed on old code); after, it produces `isolation/org-from-input`. The good app with `org_id` stripped still passes.
- **`idField`:** the create response id is read from the create action's `idField` (default `id`). Fixture app option `idField: 'noteId'`: before the fix the good app got a false `isolation/create-failed`; after, it passes and `missing-org-filter` is caught as `isolation/cross-read`. A response without the declared field still gives `isolation/create-failed` (fail closed).
- `IsolationTarget` gained an optional `orgIds`. The app launcher (P2-08) must supply it from its seed.
- Tests: `suites/tenant-isolation` 3 new failing tests before the fix, all pass after. Root: `pnpm test` 42 files, 687 passed, 5 skipped, exit 0; `pnpm typecheck` 0; `pnpm lint` 0.
