---
inclusion: always
---

# Agent workflow (dev-time team)

Applies to the agents in `.kiro/agents/`. Lathe's runtime agents in `integrations/kiro/agents/` are a different, untrusted family and are governed by `security.md`.
Ownership tables and risks: `docs/agents/team.md`. Owner, reviewer and wave for each task: `docs/agents/task-ownership.md`. Parallel plan: `docs/agents/workstreams.md`.

## Task lifecycle
`Ready → In progress → Reported → In review → Done`, with side exits `Blocked` and `Failed`.
1. **Ready:** all dependencies in `TASKLIST.md` are Done. Otherwise stop and report a blocker.
2. **In progress:** work on branch `task/<ID>-short-name`, only on the task's owned paths.
3. **Reported:** owner writes `docs/reports/<ID>-<role>.md` (format below).
4. **In review:** the reviewer (an agent role) re-runs tests and writes `docs/reviews/<ID>-<reviewer>.md` with a verdict: approve, changes requested, or blocked.
5. **Done:** report with real output plus an approving review. Only `documentation` edits status in `TASKLIST.md`.
Human sign-off and cross-review by person A or B follow `docs/agents/two-person-plan.md`. Only the assigned owner starts a task. No agent starts a task assigned to another role.

## Ownership and shared-file restrictions
- One owner per path (`docs/agents/team.md` §3). Do not edit paths you do not own, even for a one-line fix. Send a handoff request.
- Protected: `packages/verification-harness/**` (only `verification`), `.github/**` and `.kiro/hooks/**` (only `devops`), contracts C1–C4 (only `architect`).
- `pnpm-lock.yaml` is generated. On conflict, rebase and re-run `pnpm install`. A package owner edits dependencies only in their own `package.json`.
- Shared writable areas are limited to your own report and handoff files in `docs/reports/` and `docs/handoffs/`.

## Parallel execution
- Run in parallel only on disjoint paths and against frozen contracts. Use a separate git worktree per concurrent task.
- Interfaces are frozen at gate G1 before parallel tracks start. Until a dependency lands, develop against its fake (for example the fake ACP server).
- Cross-role integration happens only at the wave gates in `workstreams.md`.
- A review verdict gates the merge of a task, not the start of the next independent task.

## Handoffs
File `docs/handoffs/<from>-to-<to>-<name>.md` containing: what is needed, why, exact interface (types, paths), deadline, blocked task ID. The receiver acknowledges in the same file and links the resulting commit or report. An unacknowledged request is not accepted. Contract changes go to `architect`, who lists affected consumers and waits for their acknowledgment before editing.

## Completion evidence
No claim of completion without evidence. A report has these eight parts, in order:
1. Objective completed (task ID; say "partially completed" if so)
2. Files created or modified
3. Technical decisions, each with the rejected alternative
4. Tests executed (exact commands)
5. Test results (pass and fail counts, real output excerpt, exit code)
6. Remaining issues (gaps, shortcuts, accepted risks)
7. Dependencies or blockers
8. Recommended next task

Commands that were not run are stated as not run, with the reason. Never write "tests pass" from reading code.

## Failure reporting
When blocked or failing, stop and report; do not work around.
- Same failure after three attempts: stop and report.
- Failure report contains: task ID, what failed, the exact command and output, what was tried, current state of the working tree (what to discard or keep), suspected cause marked as hypothesis, and who can unblock.
- Never hide, skip or weaken a failing test, gate or policy. If a gate seems wrong, send a handoff to `verification` and `architect`.
- Security concern, or any suspected cross-tenant, privilege, credential or sandbox issue: go to `security` immediately. A blocked verdict stops the merge.
- Scope or deadline problems go to the human. Cut order is Could, then Should, then the Lathe-generated Team Operations module.

## Git
One branch per task. Conventional Commits that mention the task ID. Do not commit unless the human or Crew conductor asks. Never force-push, `reset --hard`, push to `main`, merge or deploy.
