# P2 Verification Harness: requirements (Partial)
Status: Partial. Existing: runner, result hash and CLI (P2-01), protected-path check (P2-02). Missing: the remaining gates and suites. Source of truth for task status: `TASKLIST.md` (Existing, Partial, Missing, Proposed).

## Scope

Tasks P2-01 to P2-07 in `TASKLIST.md`. Gate runner and suites; every gate ships with fixtures it must catch.

## Requirements

1. Each task meets the acceptance criteria and tests listed in its `TASKLIST.md` row.
2. Work follows `.kiro/steering/` and stays in the owner's paths (`docs/agents/team.md §3`).
3. Each task ends with a report in `docs/reports/` containing real command output, and an approving review in `docs/reviews/`.

## Next

Write `design.md` and `tasks.md` when the first task of this phase is picked up. The owner is in `docs/agents/task-ownership.md`.
