# Lathe Architecture

Status labels: **Existing**, **Partial**, **Missing**, **Proposed**. At the time of writing everything is Missing/Proposed (empty repository).

## 1. Repository assessment (discovery result)

| Area | Finding |
|---|---|
| Source code | None. Workspace folder is empty. |
| Git | Not a git repository. |
| Dependencies/config/CI | None. |
| Documentation/conventions | None. This blueprint establishes them. |
| Reusable | Nothing in the repo. |
| Machine tooling | Node v24.14.0, git 2.39.2, Docker 29.9.2 present. `kiro-cli` present and reports `kiro-cli-chat 2.7.0`. Not logged in (`kiro-cli whoami`: "Not logged in"). |
| Technical debt | None yet. Risk is in unverified assumptions, listed in §9. |

Note on the Kiro CLI version: the installed binary reports 2.7.0, while current Kiro docs describe behaviour from 2.3x and 3.x (ACP settings, `--v3`, `acp.agentEngine`). The installed `kiro-cli acp --help` offers `--agent`, `--model`, `--trust-all-tools`, `--trust-tools`, `--agent-engine v1|v2|kas`. The integration must be validated against the version actually pinned (task P4-01).

## 1a. Kiroween 2026 scope

Lathe is submitted to Kiroween 2026, Skeleton Crew category (deadline Dec 4, 2026, 2:00 PM PST). The Skeleton is `packages/application-foundation` plus `templates/app-starter`; the two apps are `apps/support-desk/` and `apps/team-operations/`; Lathe's Factory Engine builds and repairs bounded modules inside them under independent verification. Sections below describe the target design. Where the MVP is simpler, IMPLEMENTATION_PLAN.md says so ("Scope cuts").

## 1b. Product architecture overview

[docs/architecture/09-product-overview.md](docs/architecture/09-product-overview.md) redraws the project owner's reference picture (users, Workspace, Factory Engine, Kiro, Kiro Crew, GitHub, generated outputs, end-to-end flow) and lists where this architecture deliberately differs from it. The image file itself is not in the repository yet; it belongs at `docs/architecture/reference/lathe-architecture-overview.png`.
## 2. Architectural stance

- **Modular monolith** in a TypeScript pnpm monorepo. One deployable control plane (Workspace + Engine API), plus isolated **sandbox runners** (containers). Sandboxes are the only separate runtime unit, because isolation is a concrete security requirement.
- **PostgreSQL** for Engine state and for generated apps (separate databases).
- **Strict boundary: "builder" vs "verifier".** Agents write code. Deterministic harnesses judge it. The verifier code and policy live outside any path an agent can write.

## 3. Components

### A. Workspace (`apps/workspace`)
Next.js UI over the Engine API. Projects, specs, runs, agent activity stream, gate results, artifacts, evidence, PR status. No business logic; calls `apps/engine` through a typed API.

### B. Factory Engine (`apps/engine` + `packages/engine-*`)
Fastify (or equivalent) API + worker in one process initially. Internal modules:
- `intake`: requirements → structured spec (Zod-validated; spec-agent proposes, human approves).
- `planner`: spec → task graph (DAG) with per-task acceptance checks.
- `orchestrator`: run state machine (see below), persisted, resumable.
- `agent-runtime`: starts sandboxes, drives Kiro sessions.
- `gates`: invokes the verification harness, stores results.
- `repair`: bounded repair loop.
- `evidence`: append-only, hashed evidence store.
- `delivery`: GitHub branch/commit/PR.
- `approvals`: human approval records.

Run states: `DEFINED → PLANNED → BUILDING → TESTING → VERIFYING → (REPAIRING → BUILDING)* → AWAITING_APPROVAL → DELIVERED | FAILED | CANCELLED`. Transitions are code-enforced and logged. Only the Engine moves a run to `VERIFIED`; agents cannot.

### C. Kiro Integration (`packages/kiro-adapter`)
See §5.

### D. Skeleton / Application Foundation (`packages/application-foundation`, `templates/app-starter`)
Auth, organizations, memberships, RBAC, tenant isolation (Postgres RLS + app-layer guard), authorization, audit events, DB conventions, security conventions, and a tenant contract each app exports for the harness. Consumed by both apps as a workspace package.

### E. Apps (`apps/support-desk/`, `apps/team-operations/`)
Created from `templates/app-starter` with Kiro IDE/Crew. Lathe runs build and repair bounded modules inside them from specs in `specs/`. Both import `packages/application-foundation`; copying its code is a gate failure.

### F. Verification Harness (`packages/verification-harness/`)
See §6.

### G. GitHub Delivery (`packages/github-delivery`)
GitHub App (not PATs), branch per run, signed commits via Engine identity, PR body with evidence summary, required CI checks, mandatory human review. See §7.

## 4. Development-time vs runtime Kiro, and where MCP and Crew fit

| | Development of Lathe | Runtime of Lathe |
|---|---|---|
| Tool | Kiro IDE, Kiro Crew, Kiro CLI | `kiro-cli acp` (primary), `kiro-cli chat --no-interactive` (fallback) |
| Who | Persons A and B driving the 8 agents in `.kiro/agents/` | Factory Engine, through `integrations/kiro` |
| Output | Lathe source | Generated app modules |
| Dependency of the product | No | Yes (Kiro CLI only) |
| Kiro Crew | Optional dispatcher for the dev-time agents, waves in `docs/agents/workstreams.md` | **Not used.** No documented embeddable runtime API |
| MCP | Optional, only when a server removes a concrete step. Configured in `.kiro/settings/mcp.json`, per agent via `tools: ["@server"]` | **None.** Sessions start with `mcpServers: []` |
| Steering, hooks, specs, custom agents | `.kiro/steering`, `.kiro/hooks`, `.kiro/specs`, `.kiro/agents` | Runtime agent configs and prompts in `integrations/kiro/agents/` |

Map of every Kiro feature to its place in the repository: [docs/architecture/10-kiro-usage-map.md](docs/architecture/10-kiro-usage-map.md).
## 5. Kiro integration options

Verified from kiro.dev docs (ACP and Headless pages) and local `--help`.

| Option | Facts | Fit |
|---|---|---|
| **ACP** (`kiro-cli acp`) | JSON-RPC 2.0 over stdio. Methods: `initialize`, `session/new`, `session/load`, `session/prompt`, `session/cancel`, `session/set_mode`, `session/set_model`. Streams `AgentMessageChunk`, `ToolCall`, `ToolCallUpdate`, turn end. Client can supply `cwd`, `mcpServers`, fs and terminal capabilities. Supports `--agent`, `--trust-tools`. | **Recommended.** Structured events feed the Workspace activity view and evidence log. Cancellation and session resume exist. |
| Headless CLI (`kiro-cli chat --no-interactive`) | Needs `KIRO_API_KEY`. One prompt, text output. `--trust-all-tools` / `--trust-tools`. | Fallback for simple one-shot tasks and CI. No structured event stream. |
| Kiro Crew | No documented runtime API. | Not used. |
| Kiro `serve` (WebSocket KAS server) | Listed in `kiro-cli --help`. Not evaluated. | Out of scope until documented. Review in P4-01. |

Design:
- `KiroAdapter` interface (`startSession`, `prompt`, `cancel`, `events`), implemented by `AcpAdapter` first. A `HeadlessAdapter` is optional later.
- Engine acts as the ACP **client**. It answers fs/terminal requests itself where it needs to enforce policy, otherwise Kiro runs inside the sandbox with a minimal tool allow-list (`--trust-tools`, never `--trust-all-tools` outside the sandbox).
- Each task gets a fresh session, a task-specific custom agent config (`agents/*.json`) with scoped tools, and a prompt built from the spec + task + acceptance checks.
- Auth: a Lathe-owned Kiro API key, injected only into the sandbox's Kiro process, never into app code or repo. Confirm licensing and rate limits for automated use (Decision D3).
- All events are persisted to evidence with timestamps.

## 6. Verification independence

Rules enforced by code, not by prompt:
1. **Protected paths**: `packages/verification-harness/**` (suites, policies, fixtures), `.github/**`, `CODEOWNERS`, `packages/application-foundation/**` during app-module runs, lockfile policy. The sandbox mounts them read-only or does not mount them. The Engine rejects any agent diff touching them (path-deny check on the final diff, independent of the sandbox).
2. **Separate execution**: verification runs in a *fresh* verifier container from a Lathe-pinned image, using the harness from the trusted checkout, against the agent's diff applied to a clean tree. The agent container is destroyed before verification.
3. **Test integrity**: generated app tests written by agents are allowed, but gates also run Lathe-owned *conformance suites* (RBAC matrix, tenant isolation, deny-by-default) that agents cannot edit. Agent-written tests cannot reduce the required set. Test-count/coverage floors and mutation checks (later) detect deleted or weakened tests.
4. **Result signing**: the verifier writes results with a hash of inputs (commit SHA, harness version, policy hash). Only the Engine can mark a gate passed, by reading verifier output. CI re-runs the same gates on GitHub as a second, independent check.
5. **Gate list**: typecheck, lint, build, unit, integration, RBAC matrix, tenant isolation (cross-tenant read/write/list/ID-guess), deny-by-default (every route/handler needs an explicit permission declaration), authorization, property-based (fast-check), security (dependency audit, secret scan, SAST such as semgrep), migration check.

## 7. Delivery

GitHub App with minimal scopes. Branch `lathe/<project>/<run-id>`. Engine commits; PR is opened as draft with evidence summary. Branch protection: required CI checks, CODEOWNERS review, no direct pushes. Merge and production deployment are never automated: they require a human. Lathe records approvals in the Engine DB, but the authoritative gate is GitHub branch protection.

## 8. Tenant isolation model

- Every tenant-owned table carries `org_id NOT NULL`.
- Postgres **RLS** enforced with `FORCE ROW LEVEL SECURITY`, policy `org_id = current_setting('app.org_id')::uuid`. App DB role is non-owner, no `BYPASSRLS`.
- Request pipeline sets `app.org_id` per transaction from the authenticated membership, never from client input.
- Authorization: `can(principal, action, resource)` deny-by-default. Roles → permissions mapped in code; every handler must declare a permission or the build gate fails.
- Team Operations adds hierarchical scopes (org → team → project) with permission inheritance, explicit deny wins.
- Audit events are append-only, written in the same transaction as the change.

## 9. Repository structure (Kiroween MVP, ADR 0007)

Skeleton Crew requires the two apps in separate folders and `/.kiro` at the root. Folders are created only when their task starts. Package split follows who owns what: one folder, one owner role.

```
/
├─ .kiro/                    # agents/ steering/ hooks/ specs/ settings/mcp.json (committed, required by rules)
├─ apps/
│  ├─ workspace/             # landing page (marketing routes) + Workspace (app routes) + dashboard
│  ├─ support-desk/          # app 1
│  └─ team-operations/       # app 2
├─ packages/
│  ├─ application-foundation/  # auth, orgs, memberships, RBAC, tenancy (RLS), audit
│  ├─ shared-contracts/        # types + Zod only: C1 tenant contract, C2 Kiro/sandbox, C3 gates, C4 Engine API
│  └─ verification-harness/    # [PROTECTED] runner, suites, policies, fixtures, lathe-verify CLI
├─ services/
│  └─ factory-engine/        # API, orchestrator, pipeline, evidence, approvals, db, composition root
├─ integrations/
│  ├─ kiro/                  # ACP adapter, fake ACP server, sandbox runner, runtime agent configs, sandbox image
│  └─ github/                # branch, commit, draft PR
├─ templates/app-starter/    # copied by `pnpm new-app`; with application-foundation it forms the Skeleton
├─ specs/                    # product specs that Lathe runs build (dev-time specs are in .kiro/specs/)
├─ infra/  scripts/  docs/  tests/
└─ .github/                  # [PROTECTED] CI, CODEOWNERS
```

Changes against the proposal, and why, are in ADR 0007. The post-hackathon layout is in docs/backlog/.
## 10. Agent decomposition

Runtime agents (inside Lathe, via Kiro CLI): `spec-agent` (requirements → spec draft), `planner-agent` (spec → task DAG draft; Engine validates schema), `builder-agent` (implements one task), `repair-agent` (fixes given failing gate output only), `review-agent` (read-only diff review, advisory). Verifiers are **not** agents.

Development-time roles (Kiro Crew / IDE): architect, platform-engineer, backend-engineer, frontend-engineer, security-engineer, test/verification-engineer, devops, docs. Each TASKLIST item names one.

## 11. Technology proposals (need approval)

TypeScript strict, pnpm workspaces + Turborepo, Node 22 LTS (local is 24; pin in `.nvmrc` and CI), Fastify, Zod, PostgreSQL 16, Drizzle ORM (SQL-first migrations, RLS-friendly), Vitest, fast-check, Playwright, Next.js, Docker for sandboxes, Octokit.

## 12. Risks

See SECURITY.md and IMPLEMENTATION_PLAN.md. Top: Kiro automation licensing/auth and version drift, sandbox escape and prompt injection, verifier gaming, nondeterministic agent output vs reproducibility, RLS misconfiguration, scope creep.

## 13. Decisions

Approved by you (Nov 15): D1 TypeScript modular monolith, D2 ACP adapter subject to the P0-04 spike, D4 Postgres + RLS + deny-by-default, D5 skeleton written first, D6 Docker sandbox on Linux/WSL2 (WSL2 Ubuntu is present on this machine).

Still open:

| ID | Decision | Alternatives | Recommendation |
|---|---|---|---|
| D3 | Kiro auth for automation | API key; mounted login; host-run Kiro | Decided by the P0-04 go/no-go on Nov 17, paths A→D |
| D7 | ORM | Drizzle; Prisma; Kysely | Drizzle: plain SQL migrations make RLS policies easy to read and review |
| D8 | App UI | API only; Next.js full stack | Next.js full stack: judges score Design and need working URLs |
| D9 | App location | Monorepo top-level folders; separate repos | Top-level `apps/support-desk/` and `apps/team-operations/` in this repo, as the rules require separate folders |
| D10 | Authentication | Better Auth; Auth.js; hosted OIDC (Clerk, Auth0); custom | Better Auth with email/password: self-hosted, TypeScript, Drizzle adapter, demo accounts are easy for judges. Hosted OIDC needs third-party accounts and adds a dependency for judges' logins. Orgs/RBAC stay in `packages/application-foundation` so the authorization model is ours |
| D11 | What Lathe generates in the demo | Whole apps; bounded modules | Bounded modules (Support Desk Knowledge Base, Team Operations shared resources). Apps themselves are built from the skeleton with Kiro IDE/Crew |
| D12 | How the tenant bug is seeded | Ask the agent to make a mistake; Engine-side labeled fault injection | Labeled fault injection (P5-05): deterministic, and the UI and evidence show it was injected, so the demo is honest |
| D13 | Hosting for apps | Vercel + Neon; AWS (RDS + App Runner/ECS); Vercel + AWS RDS; Render; Railway; Fly.io | **Decided Nov 27 (A): Vercel + Neon Postgres** for the two apps and the static landing page. Conditions: (1) app connects as a role created by SQL, not the table owner, `NOBYPASSRLS` (checked by query in P11-03); (2) migrations and seed run from a trusted machine as the owner role, never in the Vercel build; (3) preview deployments off or `lathe/*` branches ignored, and no production secrets in preview environments; (4) landing deploys only the `(marketing)` routes as a static build, no Engine-backed routes; (5) sign-in rate limit uses shared storage, not per-instance memory; (6) deploy with the Vercel CLI, no Vercel GitHub App on the repo. Rejected for the MVP: AWS (more setup and misconfiguration risk with 6 days left), Vercel + RDS (RDS would need a public endpoint). AWS is reconsidered if the Engine is hosted (D14, after the hackathon) |
| D14 | Is Lathe Engine hosted | Not hosted; read-only replay of recorded runs; full hosted | Not hosted for running agents. Read-only replay only if time allows (P9-03) |
| D15 | GitHub auth | GitHub App; fine-grained token | Fine-grained token for one repo, held by the Engine only. GitHub App after the hackathon |
| D16 | License | MIT; Apache-2.0 | MIT |
| D17 | Landing page and Workspace structure | Separate apps; one Next.js app with route groups | One app in `apps/workspace`: `(marketing)` static public routes and `(app)` authenticated routes. They share tokens and `components/ui`. Marketing routes make no Engine calls, and the Engine API is not reachable from the public site. If hosting needs a split later, the route groups can be separated without redesign |
| D18 | Design system scope | Shared package for Lathe and both apps; Lathe-only | Lathe-only (`apps/workspace`). `apps/support-desk/` and `apps/team-operations/` use `templates/app-starter` UI so they stay independent of `lathe/*` and visibly distinct, which supports the Skeleton Crew story |
| D19 | UI vocabulary | Use DELIVER everywhere; use Ship everywhere | State machine and docs use DEFINE, PLAN, BUILD, TEST, VERIFY, DELIVER. The UI and landing page label the last step "Ship", defined as a draft PR with evidence plus human approval, never as deployment |
