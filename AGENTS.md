# AGENTS.md

Lathe is a Mini Software Factory built for Kiroween 2026 (Skeleton Crew). Everything is **Proposed / not started** until a task report with evidence says otherwise.

This file is always loaded by Kiro. It only routes you to the real rules, which live in steering so they are written once.

## Two agent families. Do not mix them up.

| | Dev-time team | Lathe runtime agents |
|---|---|---|
| Purpose | Build Lathe, the skeleton and the two apps | Build and repair app modules inside Lathe sandboxes |
| Definitions | `.kiro/agents/*.md` | `integrations/kiro/agents/*` (task P4-04) |
| Runs in | Kiro IDE, Kiro Crew, Kiro CLI | `kiro-cli acp` inside a sandbox |
| Trust | Works in the real repo, reviewed by humans | Untrusted, no credentials, cannot touch `packages/verification-harness/` |

## Where the rules are

| Topic | File |
|---|---|
| What Lathe is, MVP scope, non-goals | `.kiro/steering/product.md` |
| Module boundaries, dependency rules, Kiro and GitHub boundaries | `.kiro/steering/architecture.md` |
| Stack, naming, types, errors, API, database, code review | `.kiro/steering/engineering-standards.md` |
| Deny-by-default, tenancy, agent boundaries, secrets, approvals, audit | `.kiro/steering/security.md` |
| Test levels, property tests, isolation tests, gates, regression | `.kiro/steering/testing.md` |
| Task lifecycle, ownership, parallel work, handoffs, reports, failures | `.kiro/steering/agent-workflow.md` |
| Who owns which path, responsibility matrix, risks | `docs/agents/team.md` |
| Where Crew, MCP, agents, steering, hooks and specs are used | `docs/architecture/10-kiro-usage-map.md` |
| Owner, reviewer and wave of each task | `docs/agents/task-ownership.md` |
| Parallel plan and gates | `docs/agents/workstreams.md` |
| Two humans (A lead, B fullstack): tracks, review policy, cut ladder | `docs/agents/two-person-plan.md` |
| Tasks and dates | `TASKLIST.md`, `IMPLEMENTATION_PLAN.md` |

## Before any task

Read the steering files above, find your task row in `docs/agents/task-ownership.md`, and confirm you are the owner. If not, or if a dependency is not Done, stop and report a blocker.

Planned commands (not available until P0-02): `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm verify <app>`. Do not assume a command exists before its task is done.
