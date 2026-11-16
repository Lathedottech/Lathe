---
inclusion: always
---

# Architecture

Diagrams: `docs/architecture/`. Decisions: `docs/adr/` (structure: ADR 0007). Full rationale: `ARCHITECTURE.md`. This file holds only the rules agents must follow while coding.

## Modular monolith
One deployable control plane (Engine API + worker, Workspace). The only separate runtime units are the sandbox containers (agent, verifier). No microservices, no message broker. A folder is created only when its task starts.

```
.kiro/                     agents, steering, hooks, specs, settings (committed; never gitignored)
apps/
  workspace/               landing page (marketing routes) + authenticated Workspace + dashboard
  support-desk/            generated app 1
  team-operations/         generated app 2
packages/
  application-foundation/  auth wiring, orgs, memberships, RBAC, tenancy (RLS), audit
  shared-contracts/        types and Zod schemas only: C1 tenant contract, C2 Kiro/sandbox, C3 gates, C4 Engine API
  verification-harness/    PROTECTED: runner, suites, policies, fixtures, `lathe-verify` CLI
services/
  factory-engine/          API, orchestrator, pipeline, evidence, approvals, db, composition root
integrations/
  kiro/                    ACP adapter, fake ACP server, sandbox runner, runtime agent configs, sandbox image
  github/                  branch, commit, draft PR (the only holder of a GitHub token)
templates/app-starter/     starter copied by `pnpm new-app` (with application-foundation = the Skeleton)
specs/                     product specs that Lathe runs build (not `.kiro/specs/`, which are dev-time)
infra/ scripts/ docs/ tests/
.github/                   PROTECTED: CI, CODEOWNERS
```

## Responsibilities
- **Factory Engine:** receives specs, validates plans, owns the run state machine, starts sandboxes and drives Kiro through interfaces, invokes verification, stores evidence and approvals, runs bounded repair, requests delivery. It is the **only** component that can record a gate as passed or move a run to a passing state.
- **Workspace:** one Next.js app. `(marketing)` route group is public and static and never calls the Engine. `(app)` route group is authenticated and renders real Engine state. No business logic, no direct DB access, no placeholder states.
- **application-foundation:** reusable tenancy, authorization and audit. Knows nothing about Lathe.
- **Apps:** domain logic on top of the foundation. Never copy foundation code into an app.

## Kiro boundary
- The Engine talks to Kiro only through the `KiroAdapter` and sandbox interfaces in `packages/shared-contracts`. Only `integrations/kiro` spawns processes or speaks ACP. The Engine's composition root (`services/factory-engine/src/main.ts`) wires the implementation in.
- Primary integration is ACP (`kiro-cli acp`, JSON-RPC over stdio); the final path is chosen by spike P0-04. Tests use the fake ACP server, not the real CLI. Real-Kiro runs are separate and labeled.
- **Kiro Crew** is a development tool only. Nothing under `services/`, `integrations/`, `packages/` or `apps/` may depend on it.
- **MCP:** Lathe runtime sessions are created with no MCP servers. Dev-time MCP servers are configured only in `.kiro/settings/mcp.json` after an explicit decision (see `docs/architecture/10-kiro-usage-map.md`).

## Harness and verification
- **Harness** (`packages/verification-harness`): gate runner, contract-driven suites (tenant isolation, RBAC matrix, deny-by-default, properties), policies, and the fixtures each gate must catch.
- **Verification** is the process: agent sandbox destroyed → fresh verifier container → clean tree + agent patch → harness taken from the trusted base commit → gates run → Engine records a result bound to a hash of (commit, harness, policy).
- The Engine runs `lathe-verify` as a **process**. It never imports harness code, so agents and Engine code cannot alter gate logic.
- Suites learn about an app only through its exported tenant contract (C1).

## GitHub delivery boundary
`integrations/github` is the only code that holds a GitHub token. It creates a branch, commits the verified patch, and opens a **draft** PR with an evidence summary. It has no merge, approve or deploy call. CI re-runs `lathe-verify` as an independent second check.

## Dependency rules
| Module | May import | Must not import |
|---|---|---|
| `packages/shared-contracts` | `zod` only, no runtime logic | everything else |
| `packages/application-foundation` | `shared-contracts`, external libraries | `services/*`, `integrations/*`, apps, `verification-harness` |
| `apps/support-desk`, `apps/team-operations` | `application-foundation` public `index.ts`, `shared-contracts` | `services/*`, `integrations/*`, `verification-harness`, the other app |
| `apps/workspace` | Engine HTTP API using types from `shared-contracts` | `services/*` internals, DB, `integrations/*` |
| `services/factory-engine` | `shared-contracts`, `application-foundation` (operator auth); `integrations/*` **only in its composition root** | app internals, `verification-harness` (run `lathe-verify` as a process), `apps/workspace` |
| `integrations/kiro` | `shared-contracts` | `services/*`, `integrations/github`, apps |
| `integrations/github` | `shared-contracts` | `services/*`, `integrations/kiro`, apps |
| `packages/verification-harness` | `shared-contracts` only, external libraries | all other first-party code |

Inside the Engine: `api → orchestrator/pipeline → {evidence, approvals} → {db, domain}`; Kiro, sandbox and GitHub are reached only through interfaces. No upward imports. Modules interact through their `index.ts`. No import cycles.

## Contracts and ownership
Contracts C1–C4 live in `packages/shared-contracts/src/` (`tenant-contract.ts`, `kiro-adapter.ts`, `gates.ts`, `api.ts`), have one owner (`architect`), contain types and Zod schemas only, and change by handoff request. Path ownership for every directory: `docs/agents/team.md` §3.
