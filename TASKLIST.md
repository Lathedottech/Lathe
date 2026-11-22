# Task List: Kiroween 2026 MVP

Task status is tracked in the [Status](#status) section. Task definitions below are the plan. Plan and dates: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Post-hackathon tasks: [docs/backlog/full-platform-tasklist.md](docs/backlog/full-platform-tasklist.md).

**Priority (MoSCoW):** Must / Should / Could. Cut order when behind: Could → Should → Lathe-generated Team Operations module.
**Agent (dev-time role, definitions in `.kiro/agents/`):** `architect`, `backend`, `frontend`, `kiro-integration`, `security`, `verification`, `devops`, `documentation`. `security` reviews and holds a veto but does not write source. `lathe-runtime` means the code is produced by a Lathe run, with `backend` (Kiro IDE) as fallback owner. Reviewers and parallel waves: `docs/agents/task-ownership.md`, `docs/agents/workstreams.md`.
People: **A** (lead, architect) and **B** (fullstack) split the tasks, see `docs/agents/two-person-plan.md`; per-task Person and Tier are in `docs/agents/task-ownership.md`. Tier 1 is needed for the demo and submission, Tier 2 is planned but cuttable, Tier 3 is cut first.  **Format:** **ID. Title** (due date): description. Pri | Deps | Agent | Files | Acceptance | Tests.

---

## Status

Last updated: 2026-11-17, recorded by the coordinator on behalf of `documentation` from the reports and reviews linked below.

**Rule:** a task is **Done** only with a report in `docs/reports/` containing real command output AND an approving review in `docs/reviews/`. Allowed values: Not started, In progress, Reported, In review, Done, Blocked, Failed.
Only tasks that have started are listed. **Every task not listed is Not started.**

| ID | Status | Evidence | Open items |
|---|---|---|---|
| P0-01 Repository init | In progress | Public repo [lathedottech/Lathe](https://github.com/lathedottech/Lathe), first commit `132716f`; MIT `LICENSE` detected by GitHub; `.kiro/` committed and not ignored; `.nvmrc`, `.editorconfig`, `.gitattributes` | No task report or review file yet. Social preview and account avatar uploads are manual and unconfirmed |
| P0-02 Lean monorepo | Done | [report](docs/reports/P0-02-devops.md), [review](docs/reviews/P0-02-architect.md) (approve, 2026-11-17): install, typecheck, lint, test, format all exit 0; planted type error and failing test both caught | Condition C1: Postgres roles check (`NOSUPERUSER`, `NOBYPASSRLS`) not run because Docker is stopped; blocks P1-02. Node 22 not tested |
| P0-03 ADRs D1-D6 | Done | [report](docs/reports/P0-03-architect.md), [approval](docs/reviews/P0-03-human.md) by the project lead, bound to a content hash | ADR 0003 stays Proposed until P0-04. ADRs 0004 and 0006 still need `security` review |
| P0-04 Kiro go/no-go spike | Blocked | Re-checked 2026-11-17: `kiro-cli-chat 2.7.0`, `kiro-cli whoami` returns "Not logged in"; Docker Desktop not running | Project lead must update the Kiro CLI, sign in, and start Docker Desktop and WSL |
| P0-07 Interface contracts C1-C4 | Done | [report](docs/reports/P0-07-architect.md), [approval](docs/reviews/P0-07-human.md) by the project lead: `packages/shared-contracts`, C2-C4 frozen v1, C1 draft; typecheck, lint, test (58 passed), format all exit 0; mutation probe caught | Consumer acknowledgments still pending in [handoff](docs/handoffs/architect-to-consumers-contracts-v1.md). C1 final in P1-06 |
| P0-08 Agent team setup | Done | [approval](docs/reviews/P0-08-human.md) by the project lead, bound to a content hash | Profiles not yet loaded in Kiro; deny rules untested (P0-09) |
| P1-01 Schema, migrations, audit table | In progress | Branch `task/P1-01-schema-audit` (B), commit `d871d78` | No report or review yet |

Not started: P0-05, P0-06, P0-09, P0-10. P0-06 needs the CODEOWNERS GitHub usernames of persons A and B.

### Next dependency-ready tasks

- P2-01 (verification runner): P0-02 Done, uses C3.
- P3-01 (Engine schema and spec/plan types): P0-02 Done, uses C4.
- P0-10 (import-boundary enforcement, B): P0-02 Done.
- P0-05 (dev-time hooks and specs).
---

## P0. Bootstrap and Kiro go/no-go

**P0-01. Repository init** (Nov 15): git, LICENSE (decision D16), `.gitignore` that does **not** ignore `.kiro/`, `.nvmrc` (Node 22), `.editorconfig`, public GitHub repo. Must | none | devops | root files | License detected by GitHub; `.kiro/` tracked | `git check-ignore .kiro` returns nothing.

**P0-02. Lean monorepo** (Nov 16): pnpm workspace with only `packages/application-foundation` and `verification`; `tsconfig.base.json` strict; ESLint, Prettier, Vitest; `infra/docker-compose.yml` with Postgres 16. Must | P0-01 | devops | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `infra/docker-compose.yml` | `pnpm i && pnpm typecheck && pnpm test` pass; Postgres starts | One real test per package.

**P0-03. ADRs D1–D6** (Nov 16): short records of approved decisions. Must | approval | architect | `docs/adr/0001..0006-*.md` | Context, options, decision, consequences each | Review.

**P0-04. Kiro go/no-go spike** (Nov 17): pin and update Kiro CLI; in a Docker container on WSL2 run `initialize` → `session/new` → `session/prompt` (write a file) → `session/cancel`; load a custom agent from workspace `.kiro/agents`; test `--trust-tools`; record auth method, event shapes, network endpoints Kiro needs. Try paths A → D (plan §P0). Must | P0-02 | kiro-integration | `scripts/spikes/acp-handshake.ts`, `docs/spikes/kiro-acp.md` | Written go/no-go with chosen path and evidence | Script re-runs from clean clone.

**P0-05. Dev-time Kiro setup** (Nov 16): steering (product, tech stack, tenancy and security rules, "never edit `packages/verification-harness/` to make a check pass"), hooks (typecheck/test on save for the changed package; warn on edits under `packages/verification-harness/` or `.github/`), one spec per phase in `.kiro/specs/`. Must | P0-01 | architect | `.kiro/steering/*`, `.kiro/hooks/*`, `.kiro/specs/*` | Hooks fire in Kiro IDE; steering loaded | Manual check, recorded for write-up.

**P0-07. Interface contracts C1–C4** (Nov 18): create the `packages/shared-contracts` package and write and freeze `src/kiro-adapter.ts` (C2), `src/gates.ts` (C3), `src/api.ts` (C4) and a draft of `packages/shared-contracts/src/tenant-contract.ts` (C1), each with doc comments and listed consumers. Must | P0-02 | architect | `packages/shared-contracts/src/*`, `packages/shared-contracts/src/tenant-contract.ts` | Compiles; consumers listed; frozen date in header; reviewed by every consumer role | Typecheck; a type-level test per contract.

**P0-08. Agent team setup** (Nov 15): `.kiro/agents/*.md`, `AGENTS.md`, steering, `docs/agents/*`, `docs/kiro-usage.md`. Must | none | architect | `.kiro/agents/*`, `AGENTS.md`, `.kiro/steering/*`, `docs/agents/*` | Human reviews and approves before any implementation task starts; agents load in the IDE | Load each agent in Kiro IDE and confirm resources and permissions resolve.

**P0-09. Kiro feature evaluation: Crew, MCP, powers** (Nov 19): check whether Kiro Crew can dispatch the workspace profiles in `.kiro/agents/` and honour their `permissions` deny rules (try one write to `packages/verification-harness/` from a non-owner profile and confirm it is blocked); evaluate dev-time MCP candidates (read-only Postgres, GitHub status) and installed powers; adopt only what removes a concrete step; record every outcome, including "not adopted", in `docs/kiro-usage.md`. If MCP is adopted, add `.kiro/settings/mcp.json` with credentials as `${VAR}` references only. Runtime sessions keep `mcpServers: []`. Should | P0-08, P0-01 | architect | `docs/kiro-usage.md`, `.kiro/settings/mcp.json` (only if adopted) | Each of Crew, MCP and powers has a recorded result with evidence; deny-rule test result recorded; no secret in the config | Manual test transcript attached to the report.

**P0-10. Import-boundary enforcement** (Nov 19): enforce the dependency table in `.kiro/steering/architecture.md` (allowed imports per package, no cycles, harness imports only `shared-contracts`, no `integrations/*` import outside the Engine composition root) with the lint tooling, run in CI. Must | P0-02 | devops | `eslint.config.js` (or the chosen tool's config), CI step | A deliberate violation in a scratch file fails lint; the clean tree passes | Lint run on a violating fixture and on the tree, output attached.
**P0-06. CI and protection** (Nov 17): GitHub Actions typecheck/lint/test; CODEOWNERS for `packages/verification-harness/`, `.github/`, `packages/application-foundation/src/{tenancy,authz}`; branch protection on `main`. Must | P0-02 | devops | `.github/workflows/ci.yml`, `.github/CODEOWNERS` | CI required on PRs; direct push to `main` blocked | Test PR.

## P1. Skeleton

**P1-01. Schema, migrations, audit table** (Nov 17): Drizzle schema for organizations, memberships, audit_events (auth tables from the library); app DB role is non-owner, no `BYPASSRLS`; audit table has no UPDATE/DELETE grants. Must | P0-02 | backend | `packages/application-foundation/src/db/*`, `packages/application-foundation/migrations/*` | Migrations up/down on clean DB | Migration test; UPDATE on audit denied.

**P1-02. Tenancy with RLS** (Nov 18): `tenantTable()` helper adding `org_id` + FORCE RLS policy; `withTenant(orgId, fn)` runs a transaction with `SET LOCAL app.org_id`. Must | P1-01 | backend | `packages/application-foundation/src/tenancy/*` | No context → 0 rows; wrong org → 0 rows; inserts with other org rejected | Integration on real Postgres; concurrent pool-leak test.

**P1-03. Authentication via library** (Nov 18): integrate the D10 library: email/password, sessions, CSRF, rate limit; `getPrincipal()`; seed script with demo users. Must | P1-01 | backend | `packages/application-foundation/src/auth/*` | Login/logout/expiry work; no secrets in logs | Integration incl. expired and forged session.

**P1-04. Organizations and memberships** (Nov 19): create org, invite link, accept, change role, remove, switch org; last owner cannot leave. Must | P1-02, P1-03 | backend | `packages/application-foundation/src/orgs/*` | Org taken from membership, never request input | Unit + integration + cross-org tests.

**P1-05. Authorization and audit write** (Nov 19): per-app role→permission map; `defineAction({ permission, input, handler })` runs auth → membership → `can()` → `withTenant` → handler → audit in one transaction; unknown role or permission denies. Must | P1-04 | backend | `packages/application-foundation/src/authz/*`, `packages/application-foundation/src/audit/*` | Action without permission fails typecheck; denied call writes audit event | Unit; fast-check: no grant without explicit permission.

**P1-06. Tenant contract** (Nov 20): `defineTenantContract({ tables, actions, roles, fixtures })` that each app exports; consumed by the harness. Must | P1-05 | architect | `packages/shared-contracts/src/tenant-contract.ts` | Template app contract validates | Unit (invalid contracts rejected).

**P1-07. Template app and generator** (Nov 21): Next.js starter: login, org switcher, members page, one example tenant resource ("notes"), layout, design tokens; `pnpm new-app <name>`; `packages/application-foundation/README.md` listing extension points. Must | P1-06 | frontend | `templates/app-starter/*`, `scripts/new-app.ts`, `packages/application-foundation/README.md` | New app generated, runs, passes P2 harness | Playwright smoke on template.

## P2. Verification Harness (every gate ships with must-catch fixtures)

**P2-01. Runner, result schema, CLI, self-test job** (Nov 18): gates in order, JSON report, result hash = f(commit, harness hash, policy hash), `lathe-verify <app>`; CI job that runs all fixtures and expects failure. Must | P0-02 | verification | `packages/verification-harness/src/{runner,schema,cli}.ts`, `packages/verification-harness/fixtures/`, `.github/workflows/harness-selftest.yml` | Same input → same hash; exit code matches result | Determinism test; self-test job.

**P2-02. Protected-path check** (Nov 19): reject diffs touching `packages/verification-harness/`, `.github/`, `policies`, lockfile rules; handles renames, symlinks, case, `..`, mode changes. Must | P2-01 | verification | `packages/verification-harness/src/protected-paths.ts`, `packages/verification-harness/policies/protected-paths.json` | All adversarial diffs rejected | Table-driven fixtures.

**P2-03. Build, type, lint, test gates with integrity** (Nov 20): run in container; detect `.skip`/`.only`, deleted tests, test count below baseline. Must | P2-01 | verification | `packages/verification-harness/src/gates/{static,tests}.ts` | Fixtures with type error and weakened tests fail | Fixtures.

**P2-04. Tenant isolation suite** (Nov 21): from the contract, create data in org A, then as org B try read, list, update, delete, and ID guess. Must | P1-06, P2-01 | verification | `packages/verification-harness/suites/tenant-isolation/*` | Catches missing `org_id` filter with RLS disabled, missing policy, and org taken from input | Seeded-leak fixtures.

**P2-05. RBAC matrix and deny-by-default** (Nov 22): roles × actions from contract; any route/server action not created with `defineAction` fails. Must | P2-04 | verification | `packages/verification-harness/suites/rbac/*` | Catches unwrapped route and over-permissive role | Fixtures.

**P2-06. Property-based suite** (Nov 22): fast-check invariants: no grant without permission, tenant never crosses, explicit deny wins (once P7-01 lands); seeds logged. Must | P2-05 | verification | `packages/verification-harness/suites/properties/*` | Failures reproducible from seed | Known-bad model fixtures.

**P2-07. Secret scan and dependency audit** (Nov 23): gitleaks on diff, `pnpm audit --audit-level high`. Should | P2-01 | verification | `packages/verification-harness/src/gates/security.ts` | Planted secret caught | Fixture.

## P3. Factory Engine core

**P3-01. Engine schema and spec/plan types** (Nov 21): tables projects, specs, runs, tasks, run_events, gate_results, approvals; Zod spec (requirements, target app, target paths, acceptance checks) and plan (tasks with paths and checks). Must | P0-02 | backend | `services/factory-engine/src/db/*`, `services/factory-engine/src/domain/{spec,plan}.ts` | Invalid spec/plan rejected with clear errors | Unit + round-trip property test.

**P3-02. Run state machine** (Nov 22): DEFINED → PLANNED → BUILDING → VERIFYING → (REPAIRING → BUILDING)* → AWAITING_APPROVAL → DELIVERED / FAILED / CANCELLED; only Engine code sets passing states; resume after restart. Must | P3-01 | backend | `services/factory-engine/src/orchestrator/*` | Illegal transitions throw; restart resumes | fast-check over transition sequences; crash/resume test.

**P3-03. Evidence and approvals** (Nov 23): append-only evidence with per-run hash chain and secret redaction; approvals store approver, content hash, time; changed content invalidates approval. Must | P3-01 | backend | `services/factory-engine/src/{evidence,approvals}/*` | Tamper detected; stale approval rejected | Unit + tamper test.

**P3-04. Engine API and SSE** (Nov 24): Fastify routes for projects, specs, runs, approvals; SSE run events; operator auth and RBAC via `packages/application-foundation`. Must | P3-02, P1-05 | backend | `services/factory-engine/src/api/*` | Every route needs a permission | Contract tests; deny-by-default suite run against Engine.

## P4. Kiro + sandbox

**P4-01. Kiro adapter** (Nov 24): `KiroAdapter` interface (`start`, `prompt`, `cancel`, `events`) implemented for the P0-04 path; timeouts. Must | P0-04, P3-02 | kiro-integration | `integrations/kiro/src/*` | Works against fake ACP server and real CLI | Fake-server tests; recorded transcript tests; manual real smoke.

**P4-02. Hardened sandbox** (Nov 24): image with pinned Kiro CLI; non-root, `--cap-drop ALL`, `no-new-privileges`, read-only root + tmpfs, CPU/mem/pids limits, no Docker socket; egress only through allow-list proxy; only Kiro credential in env. Must | P0-04 | kiro-integration | `integrations/kiro/sandbox-image/*`, `integrations/kiro/src/sandbox/*` | Scripted checks: no host env, blocked hosts unreachable, no Docker socket | Sandbox check script in CI (Linux runner).

**P4-03. Worktree and diff** (Nov 25): worktree at base commit; mount only target app (rw) and `packages/application-foundation` (ro); `packages/verification-harness/` and `.github/` absent; canonical patch out. Must | P4-02, P2-02 | kiro-integration | `integrations/kiro/src/sandbox/worktree.ts` | Patch applies to clean tree reproducibly | Integration.

**P4-04. Runtime agent configs** (Nov 25): planner, builder, repair agents with minimal tool lists and steering (use `defineAction`, `tenantTable`, contract); installed into sandbox `.kiro/`. Must | P4-01 | kiro-integration | `integrations/kiro/agents/*` | Configs load in pinned CLI | Load test; prompt-injection regression prompts.

## P5. Build → Verify → Repair

**P5-01. Plan step** (Nov 25): planner agent outputs plan JSON; Engine validates; human approves in Workspace. Must | P4-04, P3-03 | backend | `services/factory-engine/src/pipeline/plan.ts` | Invalid plan retried once, then escalated | Fake-agent tests.

**P5-02. Build step** (Nov 26): per task: sandbox, prompt, diff, protected-path check, sandbox destroyed. Must | P4-03, P5-01 | backend | `services/factory-engine/src/pipeline/build.ts` | Protected-path diff rejected and logged | E2E with fake agent.

**P5-03. Independent verification** (Nov 26): new verifier container, clean tree + patch, `packages/verification-harness/` from base commit, ephemeral Postgres, `lathe-verify`, result hash stored. Must | P2-01, P5-02 | backend | `services/factory-engine/src/pipeline/verify.ts` | Agent container gone before verify; result bound to hash | Integration.

**P5-04. Repair loop** (Nov 27): repair agent gets failing gate output only; new sandbox each attempt; max 3; same failure twice → escalate to human. Must | P5-03 | backend | `services/factory-engine/src/pipeline/repair.ts` | Stops at max; escalation recorded | Fake agent that fixes / never fixes.

**P5-05. Demo fault injection** (Nov 27): opt-in per run (`faultInjection: "drop-tenant-filter"`); after the build step the Engine applies a named vulnerable patch, logs it in evidence, and the UI labels it "injected by Lathe". Off by default; refused unless run is marked demo. Must | P5-02 | backend | `services/factory-engine/src/pipeline/fault-injection.ts`, `packages/verification-harness/fixtures/faults/*` | Injection always visible in evidence and UI | Unit; E2E shows harness catches it.

**P5-06. Self-certification attack tests** (Nov 27): fake agents that edit `packages/verification-harness/`, delete tests, add `.skip`, print "all tests passed". Must | P5-04 | verification | `services/factory-engine/test/adversarial/*` | No attack reaches AWAITING_APPROVAL | The tests.

**P5-07. Vertical slice demonstration** (rehearse Nov 28, final by Dec 1): Must | P5-01..06, P8-01, P9-04, P9-05, P9-06, P6-01 | architect | `specs/kb-articles.md`, `docs/demo/runbook.md`, recorded evidence |
Acceptance:
1. User creates a project in Lathe Workspace.
2. User submits a specification (Support Desk Knowledge Base module).
3. Factory Engine creates a task plan; user approves it.
4. Kiro generates the module using `packages/application-foundation`.
5. Lathe runs independent verification in a fresh container.
6. A seeded tenant-isolation vulnerability (P5-05) is detected by the harness.
7. Kiro receives only the failure evidence and attempts a repair.
8. Verification runs again in a fresh environment and passes.
9. Lathe opens a draft GitHub PR with evidence.
10. A human reviewer approves the delivery in Workspace and merges on GitHub.
Tests: three real-Kiro rehearsals with stored evidence; fake-agent version in CI.

## P6. Support Desk (`apps/support-desk/`)

**P6-01. Scaffold, roles, tickets, assignments** (Nov 22): from template; roles requester/agent/admin; ticket CRUD, comments, assign. Must | P1-07 | backend | `apps/support-desk/*` | Harness passes | Unit + harness.

**P6-02. SLA** (Nov 25): SLA policy per priority, due times, breach status; injected clock. Must | P6-01 | backend | `apps/support-desk/src/sla/*` | Breach computed correctly | fast-check with fake clock.

**P6-03. Approvals** (Nov 27): escalation/refund approval; requester cannot approve own request. Should | P6-01 | backend | `apps/support-desk/src/approvals/*` | Self-approval denied | Integration + RBAC suite.

**P6-05. Support Desk UI** (Nov 28): tickets list/detail, assignment, SLA badges, approvals, org switcher, members. Must | P6-02 | frontend | `apps/support-desk/src/{app,components}/*` | Usable by a new user without instructions | Playwright smoke on main flows.

**P6-04. Knowledge Base module** (Nov 28): produced by P5-07. Must | P5-07 | lathe-runtime | `apps/support-desk/src/kb/*` | Harness passes; merged via PR | Harness.

## P7. Team Operations (`apps/team-operations/`)

**P7-01. Hierarchical scopes in skeleton** (Nov 24): opt-in org → team → project scopes, inheritance, explicit deny wins. Must | P1-05 | backend | `packages/application-foundation/src/authz/hierarchy.ts` | Support Desk harness still passes | fast-check: deny wins, no escalation via nesting.

**P7-02. Scaffold, teams, projects, tasks** (Nov 26): from template; uses hierarchy. Must | P7-01, P1-07 | backend | `apps/team-operations/*` | Harness passes; same `packages/application-foundation` version as Support Desk | Unit + harness.

**P7-04. Team Operations UI** (Nov 29): teams, projects, tasks, permission-aware views. Must | P7-02 | frontend | `apps/team-operations/src/{app,components}/*` | Visually distinct from Support Desk, same template | Playwright smoke.

**P7-03. Shared resources module** (Nov 29): sharing across teams within one org, never across orgs; built by a Lathe run (fallback: Kiro IDE). Should | P7-02, P5-07 | lathe-runtime | `apps/team-operations/src/resources/*` | Isolation suite passes | Harness.

## P8. GitHub delivery

**P8-01. Branch, commit, draft PR** (Nov 27): Octokit; fine-grained token for one repo (contents, pull requests) held by Engine only; branch `lathe/<project>/<run>`; evidence summary in PR body; evidence JSON at `.lathe/evidence/<run>/`; status polling. Must | P5-03 | backend | `integrations/github/src/*` | Draft PR with evidence; Engine has no merge call | Integration against the repo.

**P8-02. CI verify workflow** (Nov 28): runs `lathe-verify` on PRs as a second independent check. Should | P2-01, P0-06 | devops | `.github/workflows/verify.yml` | Required check on `main` | Test PR with failing change.

## P9. UX/UI, Landing Page and Factory Workspace (`apps/workspace`)

One Next.js app, two route groups: `(marketing)` (public, static, no Engine calls) and `(app)` (authenticated Workspace). Both use the same tokens and `components/ui`. The apps `apps/support-desk/` and `apps/team-operations/` keep their own UI from `templates/app-starter` and do not import from `lathe/*`. Decisions D17–D19 in ARCHITECTURE.md §13. Frontend capacity is the largest schedule risk, see IMPLEMENTATION_PLAN.md §P9.

**P9-00. UX/UI design system and wireframes** (Nov 19): dark industrial identity (black, white, charcoal, controlled violet accent); tokens for color, type, spacing, grid, borders, shadows, radii; primitives: button, card, badge, status chip, table, form controls, tabs, navigation, empty/loading/error states, code and diff block; desktop and tablet layouts; focus and keyboard patterns; contrast-checked token pairs. Low-fi wireframes for the landing page and each Workspace screen are written first. Must | P0-02 | frontend | `docs/design/design-system.md`, `docs/design/wireframes.md`, `apps/workspace/src/styles/tokens.css`, `apps/workspace/src/components/ui/*` | Every landing and Workspace screen uses only these components and tokens (no ad-hoc colors); documented usage for each component; text and UI contrast meets WCAG AA | Component tests; automated contrast test over token pairs; lint rule or test that rejects hard-coded colors outside `tokens.css`. (Dependency is P0-02, not P0-01, because the `apps/workspace` package must exist.)

**P9-01. Public landing page** (skeleton Nov 22, final Dec 1): sections: navigation (logo, Product, How It Works, Architecture, GitHub, Get Started); hero "Your Mini Software Factory"; product explanation; workflow Define → Plan → Build → Test → Verify → Ship (Ship is the UI label for DELIVER: draft PR with evidence, human approves); architecture overview from `docs/architecture/`; capabilities (Agentic Development, Verification Harness, Execution Governance); showcase of Support Desk and Team Operations; Kiro integration and Kiroween 2026 story; final call to action; footer with GitHub and docs. No pricing section or pricing cards. Static content, no Engine calls. Every claim is listed in `docs/design/landing-claims.md` with the repo artifact that proves it. Screenshots are real captures of the Workspace and apps. "Get Started" links to the README quickstart. "Watch demo" appears only after the video exists (P10-04). Must | P9-00 (build), P9-03 and P9-06 (real screenshots) | frontend | `apps/workspace/src/app/(marketing)/*`, `docs/design/landing-claims.md` | Works at desktop and mobile widths; all links resolve; every claim maps to an Existing artifact; no pricing, no fabricated metrics, no "production ready" or "deploy" claims | Playwright at desktop and mobile viewports; link check; test asserting no pricing text; test that the marketing routes make no request to the Engine.

**P9-02. Workspace shell and navigation** (Nov 25): sidebar: Overview, Projects, Specifications, Factory Runs, Agents, Verification, Deliveries, Settings; top bar with project selector; user and organization menu; responsive layout; login via the skeleton auth; protected routes enforced on the server, unauthenticated users redirected. Pages without data yet show an honest empty state. Must | P9-00, P3-04 | frontend | `apps/workspace/src/app/(app)/layout.tsx`, `apps/workspace/src/components/shell/*` | Navigation works; protected routes deny by default; UI hides unavailable actions but the Engine enforces; all data via real Engine API | Playwright against the real Engine: login, logout, direct URL access without session, role without permission.

**P9-03. Factory Dashboard** (Nov 27): factory status; active projects; running builds; recent factory runs; verification pass/fail; pending approvals; recent activity and evidence; quick action "Create Factory Project". All numbers come from the Engine. Needs one aggregate endpoint `GET /v1/overview`, requested from `architect` and `backend` by handoff before this task starts. Must | P9-02, P3-04 | frontend | `apps/workspace/src/app/(app)/overview/*` | Values equal the database after a seeded scenario; informative empty states; loading and error states implemented; each item links to its project or run | Playwright with a seeded Engine DB comparing displayed counts to API; test for empty, loading and error states.

**P9-04. Factory project workspace** (Nov 27): project overview; application requirements; specifications; task plan; agent activity; build history; verification results; evidence and diffs; GitHub delivery. User creates a project, submits a spec, reviews and approves the plan (approval shows the content hash being approved). Must | P9-02, P3-04, P5-01 | frontend | `apps/workspace/src/app/(app)/projects/*` | P5-07 steps 1 to 3 performed in the UI; editing a spec after approval shows the plan as needing re-approval | Playwright E2E with the scripted fake agent.

**P9-05. Live factory run experience** (Nov 28): current stage; active agent; task progress; build logs; verification gates; detected failures; repair attempts; final result. Uses Engine events over SSE with reconnect. Agent and log output is untrusted and rendered as text. Must | P9-04, P3-04, P5-03, P5-04 | frontend | `apps/workspace/src/app/(app)/runs/*` | Status updates without reload; a failed run shows the real failure evidence; nothing simulated is shown as real | Playwright with the fake agent (a seeded failing gate); a recorded-event replay is allowed in unit tests only and is named as a fixture in the test.

**P9-06. Verification and delivery interface** (Nov 30): verification report; tenant isolation and RBAC results; security findings; evidence viewer showing the hash chain; diff viewer; "injected by Lathe" label on demo faults; draft PR status; human approval. The UI has no merge or deploy button; merging happens on GitHub. Must | P9-05, P8-01, P3-03 | frontend | `apps/workspace/src/app/(app)/{verification,deliveries}/*` | Evidence shown for a run matches its content hash; approval is explicit and records the approver and hash; stale approval is rejected | Playwright; tamper test where altered evidence is flagged; test that no merge or deploy action exists in the UI.

**P9-07. Responsive polish and accessibility** (Dec 2): responsive desktop, tablet and mobile; keyboard navigation; contrast; consistent empty, loading and error states; performance pass; browser tests. Should | P9-01, P9-02, P9-03, P9-04, P9-05, P9-06 | frontend | `apps/workspace/*`, `tests/e2e/*` | Playwright suite passes; no critical accessibility or navigation issues in the automated scan and a manual keyboard pass | Playwright; automated accessibility scan (tool named in the task report with the reason).

**P9-08. Read-only replay mode** (Dec 2): public Workspace instance showing real recorded runs with a "recorded run" banner and no write endpoints. Could | P9-06 | frontend | `apps/workspace/*`, `infra/deploy/*` | No write endpoint reachable; every run shown is a real recorded run | Playwright; request audit proving no non-GET calls.
## P10. Deploy and submit

**P10-01. Deploy apps and landing page** (Nov 30): both apps on D13 host, plus the static landing page (`(marketing)` routes only, no Engine reachable from it), with non-owner DB role and seeded demo tenants and credentials. Must | P6-02, P7-02 | devops | `infra/deploy/*` | Both URLs work; cross-tenant check against prod passes | Harness isolation suite against deployed URL.

**P10-02. Security checklist** (Dec 1): SECURITY.md MVP checklist; secret scan of history; no credentials in repo or evidence. Must | all Must | security | `docs/security/checklist.md` | All items checked or listed as accepted risk | Checklist.

**P10-03. README, judge guide, Kiro write-up** (Dec 2): how to run locally, demo credentials (in Devpost form only), how Kiro was used: specs, steering, hooks, custom agents, ACP runtime, PBT, MCP if used. Must | P10-01 | documentation | `README.md`, `docs/kiro-usage.md` | A new person runs it from README alone | Dry run by someone else.

**P10-04. Video and submission** (Dec 3): record P5-07 under 3 minutes, YouTube public; Devpost form, Skeleton Crew category. Must | P5-07, P10-03 | documentation | `docs/demo/*` | Submitted Dec 3 | Video length check; links checked from logged-out browser.