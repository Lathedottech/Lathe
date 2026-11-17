# Handoff: architect to all contract consumers, contracts v1

- **From:** architect (person A)
- **To:** backend, frontend, kiro-integration, verification (persons A and B)
- **Blocked task:** P0-07 is not Done until each consumer acknowledges below.
- **Deadline:** 2026-11-18

## What is needed

Review the contract you consume in `packages/shared-contracts/src/` and acknowledge it, or request a change. A change after acknowledgment goes through a new handoff.

| Contract | File | Status | Consumers |
|---|---|---|---|
| C1 Tenant contract | `tenant-contract.ts` | Draft (final in P1-06) | verification, backend (application-foundation) |
| C2 Kiro adapter and sandbox | `kiro-adapter.ts` | Frozen v1 | kiro-integration (implements), backend (Engine pipeline) |
| C3 Gates and `lathe-verify` | `gates.ts` | Frozen v1 | verification (implements), backend (Engine verify step) |
| C4 Engine API | `api.ts` | Frozen v1 | backend (implements), frontend (Workspace) |

## Points B should check against P1-01

- C1 requires every tenant table to declare `orgColumn: 'org_id'` and `rls: { enabled: true, forced: true }`. The P1-01 migration creates `memberships.org_id`; confirm that RLS for tenant tables lands in P1-02 so contracts can declare it truthfully.
- C4 never accepts an org id from the client. Organization switching (P1-04) must come from the membership.

## Acknowledgments

| Role | Person | Contract | Decision | Date |
|---|---|---|---|---|
| backend | B | C1, C4 | pending | |
| frontend | B | C4 | pending | |
| backend | A | C2, C3, C4 | pending | |
| kiro-integration | A | C2 | pending | |
| verification | A | C1, C3 | pending | |
