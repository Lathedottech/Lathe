# P2-05 RBAC matrix and deny-by-default (verification)

Branch `task/P2-05-rbac-matrix`, based on `task/P2-04-tenant-isolation` (`b576895`).

## 1. Objective completed
P2-05 completed in code: suite `packages/verification-harness/suites/rbac/*` with (a) an RBAC matrix and (b) a deny-by-default scan, plus fixtures. Not yet reviewed by a second role, not committed. The gate is **not** added to the default registry (no app launcher until P2-08).

## 2. Files created or modified
- `suites/rbac/matrix.ts`: roles × actions matrix from the C1 contract.
- `suites/rbac/deny-by-default.ts`: strict pattern scan for `defineAction`.
- `suites/rbac/index.ts`: exports, `readAppSources`, `rbacGate` (scan first, then matrix; `error` if the app cannot be resolved).
- `suites/rbac/rbac.test.ts`: 36 tests.
- `fixtures/rbac/fixture-app.ts`: in-memory HTTP app, 6 variants.
- `fixtures/rbac/route-sources.ts`: 17 route/action source fixtures (4 pass, 13 fail).
- `fixtures/README.md`: one line added.

## 3. Technical decisions
- Expected allow/deny is derived only from the contract (role holds the action's permission). Rejected: a separate expectation table, which could drift from the contract.
- Each (principal, action) pair gets its own fresh row, so an allowed delete cannot mask later checks. Rejected: one shared row.
- Denied means 403 or 404 and the row is unchanged, confirmed through a second principal of the same org via the read (or list) action. If the contract has neither, the suite reports `rbac/cannot-verify-no-mutation` instead of passing silently.
- Unauthenticated calls to every action must answer 401, 403 or 404.
- Deny-by-default uses a pattern scan, not an AST. Comments are stripped and string contents blanked, then each export of a handler file must be exactly one `defineAction(...)` or `defineUserAction(...)` call (or a local `const` alias of one), imported from `@lathe/application-foundation`. Rejected: an AST parser, because it would add a dependency with security impact that needs human approval; the strict scan errs toward failing.
- Handler files: `route.{ts,tsx,js,jsx,mjs}`, `pages/api/**`, and files starting with `'use server'`.
- `defineUserAction` is accepted (foundation's authenticated, non-org wrapper). Flag if that should be denied.
- The matrix client is a small copy of the P2-04 one. Rejected: editing P2-04 files to share it.

## 4. Tests executed
All from `C:\Users\user\Desktop\lathe-wt-p203`:
- `pnpm exec vitest run --project @lathe/verification-harness suites/rbac`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm exec prettier --check packages`
- `pnpm test`

## 5. Test results
- RBAC suite: 36 passed, 0 failed.
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0 (eslint, import boundaries: no violations, 147 modules).
- `pnpm exec prettier --check packages`: exit 0.
- `pnpm test`: 26 files, 372 tests passed, 0 failed, exit 0.

Fixtures caught: unwrapped route (function, arrow, default export, server action, mixed file, alias to unwrapped, comment or string spoof, `?? bypass`), local or foreign `defineAction`, re-exports, inline `'use server'`; matrix: over-permissive role (`rbac/over-permissive`, `rbac/denied-mutated`), locked-out editor (`rbac/allowed-denied`), mutate-on-deny, open without session.

## 6. Remaining issues
- Only fixture apps exist. No real app has run the suite, and the gate is not in the default registry.
- Scan limits: regex literals with quotes or comment markers can confuse the sanitizer; computed or dynamic exports are not seen; `export * from` and `export { x } from` are reported as unverifiable, which may be too strict for real apps.
- Request conventions (JSON `{ label }`, answer with `id`) are shared with P2-04 and are not expressed by C1 v1.
- Matrix works on `tenant` tables with a create action only; custom action kinds are called with the update-style body.
- Anonymous requests to create-style actions on a leaky app may create rows that are not cleaned up.
- No mutation testing of the sanitizer beyond the listed fixtures.

## 7. Dependencies or blockers
None. P2-04 branch is the base. No new dependencies.

## 8. Recommended next task
P2-06 (property-based suite), then P2-08 (app launcher) to register `tenantIsolationGate` and `rbacGate`. Independent re-run by the reviewer is still required.
