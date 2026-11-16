---
inclusion: fileMatch
fileMatchPattern: ["**/*.test.ts", "**/*.test.tsx", "tests/**", "packages/verification-harness/**", "**/fixtures/**"]
---

# Testing

Rules being tested come from `security.md` and `architecture.md`. Task reports must contain real command output (`agent-workflow.md`).

## Levels
| Level | Scope | Rules |
|---|---|---|
| Unit | Pure logic, one module | Vitest, no network, no real DB. Time and randomness injected |
| Integration | Module + real PostgreSQL 16 | Run as the **non-owner app role**, so RLS is exercised. Never mock the database or `withTenant` |
| End to end | Operator or user flows | Playwright against the real Engine or app. Pipeline tests use the scripted fake agent on every PR; real Kiro runs are separate, labeled, and recorded as evidence |
| Property-based | Invariants over generated inputs | fast-check, see below |
| Security | Abuse of the rules in `security.md` | See below |

Mocks and fakes live in clearly named test fixtures. A mock never produces a "passed" verification result outside a test of the Engine itself.

## Property-based testing
Use it for: authorization (`can()` never grants without an explicit permission; explicit deny wins; nesting never escalates), tenant isolation (data created in org A is invisible from org B for any generated operation sequence), Engine run state machine (no sequence of events reaches a passing state without a recorded gate pass), SLA and date calculations (injected clock), parsers and schemas (round trip).
- Log the seed on failure. Convert every failing seed into a permanent example test.
- Keep generators small and deterministic. No unbounded runtime.

## Tenant isolation tests (contract-driven)
Each app exports a tenant contract (tables, actions, roles, fixtures). For every tenant table and action, the suite creates data in org A and, as a member of org B, attempts: read by ID, list, search, update, delete, create with org A's `org_id`, and ID guessing. Expected result is 404 or empty, never data. It also asserts: no tenant context → zero rows, wrong context → zero rows, context does not leak between pooled connections, and the app role lacks `BYPASSRLS`.

## Security tests
Missing `defineAction` on a route fails; every role × action in the RBAC matrix matches the expected allow or deny; unknown role denies; self-approval is denied; audit rows exist for denials; audit rows cannot be updated or deleted; a secret planted in a diff is caught; a diff touching `packages/verification-harness/` or `.github/` is rejected (renames, symlinks, case, `..`, mode changes); agent-written output claiming success is ignored.

## Verification gates
Run by `lathe-verify` in a fresh container, in order, and each is binary:
1. Protected-path check
2. Typecheck, lint, build
3. Unit and integration tests, with integrity checks (no `.skip` or `.only`, no deleted tests, test count at or above baseline)
4. Tenant isolation suite
5. RBAC matrix and deny-by-default suite
6. Property-based suite
7. Secret scan and dependency audit

The result hash is a function of the commit, harness and policy. The same inputs give the same hash. Thresholds live in `packages/verification-harness/policies/` and change only by `verification` with human approval. Nobody weakens a gate, threshold or fixture to make a task pass.

## Fixtures, regression and flakiness
- Every gate ships with fixtures: planted bugs it must catch (missing `org_id` filter, RLS off, org taken from input, unwrapped route, over-permissive role, weakened test, edited policy). The CI self-test fails if any fixture passes.
- Every fixed bug first gets a failing test. If the bug class is a gate gap, it also gets a fixture, requested from `verification` by handoff.
- No retries to hide flaky tests and no sleeps for synchronization. Fix the cause. A test is removed only with a written reason and reviewer approval.
- A test that cannot fail is a defect.
