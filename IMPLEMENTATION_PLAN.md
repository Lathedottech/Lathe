# Implementation Plan: Kiroween 2026 MVP (Skeleton Crew)

Window: **Nov 15 → Dec 4, 2026** (deadline Dec 4, 2:00 PM PST). Target submission Dec 3; Dec 4 morning is buffer only.
Status of everything below: **Proposed / not started**.
The full-platform plan is kept in [docs/backlog/full-platform-plan.md](docs/backlog/full-platform-plan.md) for after the hackathon.

## What we are submitting

| Hackathon requirement | Lathe deliverable |
|---|---|
| Skeleton code template | `packages/application-foundation` (auth wiring, orgs, memberships, RBAC, tenancy via RLS, audit) + `packages/shared-contracts` (tenant contract) + `templates/app-starter` (starter app) |
| Two distinct apps from it, in separate folders | `apps/support-desk/` and `apps/team-operations/` |
| Kiro usage | Dev-time: specs, steering, hooks, custom agents in `/.kiro`. Runtime: Lathe drives Kiro CLI to build and repair app modules |
| Working app URLs | Both apps hosted with seeded demo tenants |
| Demo video < 3 min | The P5-07 vertical slice |

The thesis we must prove: **an agent writes code, Lathe verifies it independently, and the agent cannot certify itself.**

## Scope cuts versus the full plan

| Cut or simplified | Why |
|---|---|
| Lathe generates **modules** inside the two apps, not whole apps from scratch | Whole-app generation is slow and unreliable inside 19 days. Apps are built from the skeleton with Kiro IDE/Crew (spec-driven); Lathe builds and repairs a bounded module in each |
| No spec-agent; user submits the spec | Removes one unreliable agent step |
| No review-agent, no budgets beyond timeouts | Not needed to prove the thesis |
| Fine-grained GitHub token instead of GitHub App; status polling instead of webhooks | Less setup; accepted risk documented in SECURITY.md |
| Explicit tenant contracts instead of generic discovery | Your P2-05 change |
| Adversarial fixtures built with each gate | Your P2-09 change |
| No gVisor, SAST, observability stack, chaos tests, `kiro-cli serve` evaluation | Post-hackathon |
| Lathe Engine is not publicly hosted | It runs Docker and Kiro on a trusted machine. Judges see it in the video and, if approved, in a read-only replay of real recorded runs |
| Engine modules are folders in one package, not separate packages | Your P0-02 change |

Security essentials stay in each phase: RLS and deny-by-default (P1), protected paths and secret scan (P2), hardened sandbox with no credentials (P4), human approval (P5/P8).

## Schedule

| Dates | Work | Exit check |
|---|---|---|
| Nov 15–17 | P0 bootstrap, **Kiro go/no-go** | ACP or fallback path chosen with evidence |
| Nov 16–21 | P1 skeleton | Template app runs; RLS tests pass |
| Nov 18–23 | P2 harness (with fixtures) | Harness catches every seeded bug |
| Nov 20–29 | P6/P7 apps built from template (parallel track) | Both apps pass the harness |
| Nov 21–25 | P3 engine core | Fake-agent run walks all states |
| Nov 22–26 | P4 Kiro + sandbox, P9-00 design system, P9-02 Workspace shell | Real Kiro returns a diff from the sandbox |
| Nov 25–28 | P5 pipeline, P8 delivery | P5-07 rehearsal passes |
| **Dec 1** | **Feature freeze** | Only fixes, polish, docs after this |
| Nov 29–Dec 3 | P9 polish, P10 deploy and submit | Submitted |

Priority uses MoSCoW. If behind schedule, cut in this order: Could tasks, then Should tasks, then the Team Operations Lathe-generated module (build it with Kiro IDE instead). Must tasks are never cut.

---

## P0. Bootstrap and Kiro go/no-go (Nov 15–17)
- **Objective:** Working repo and a proven way for Lathe to drive Kiro.
- **Scope:** git, MIT/Apache license, pnpm workspace with only `packages/application-foundation` and `verification`, TS strict, lint, Vitest, Postgres in docker compose, CI, `/.kiro` steering/hooks, ADRs for D1–D6, Kiro spike.
- **Out of scope:** Turborepo, packages for later phases.
- **Dependencies:** This plan approved.
- **Deliverables:** Repo skeleton, `docs/adr/0001-0006`, `docs/spikes/kiro-acp.md`.
- **Acceptance:** CI green; spike shows `initialize` → `session/new` → `session/prompt` → file written → `session/cancel` working **inside a Docker container on WSL2**, authenticated without a human at the keyboard.
- **Verification:** Spike script re-run from a clean clone.
- **Go/no-go (Nov 17):** Try paths in order, stop at the first that works: (A) ACP in sandbox with API key → (B) ACP in sandbox with mounted Kiro login → (C) headless `chat --no-interactive` in sandbox with API key → (D) Kiro on host in a disposable worktree, weaker isolation, documented. If none works, Lathe ships as "independent verification and delivery for Kiro-built changes", and the Skeleton Crew submission still stands.
- **Risks:** Installed CLI is 2.7.0; docs describe 2.3x/3.x features. Likely needs an update.
- **Complexity:** S

## P1. Skeleton (Nov 16–21)
- **Objective:** A lean, reusable multi-tenant template.
- **Scope:** Auth via library (no custom crypto), orgs, memberships, invites by link, role→permission map per app, `defineAction` with deny-by-default `can()`, RLS-backed `withTenant`, audit in the same transaction, tenant contract, Next.js template app with one example resource, `pnpm new-app` script.
- **Out of scope:** Email sending, SSO admin, billing, hierarchy (added in P7).
- **Dependencies:** P0.
- **Deliverables:** `packages/application-foundation`, `templates/app-starter`, `packages/application-foundation/README.md` (extension points).
- **Acceptance:** Query with wrong or no tenant context returns zero rows under the non-owner DB role; action without a declared permission fails typecheck or startup; template app runs with seeded users in two orgs.
- **Verification:** Integration tests on real Postgres, pool-leak test, property tests on `can()`.
- **Risks:** RLS bypass via owner role; pooled connection leaking tenant context.
- **Complexity:** M

## P2. Verification Harness (Nov 18–23)
- **Objective:** Deterministic gates that agents cannot edit or bypass.
- **Scope:** Runner and `lathe-verify` CLI, result hashing, protected-path check, typecheck/lint/build, tests with integrity check, tenant isolation suite and RBAC/deny-by-default suite (both driven by tenant contracts), property-based tests, secret scan and dependency audit. **Every gate ships with fixtures it must catch.**
- **Dependencies:** P1-06 tenant contract.
- **Deliverables:** `packages/verification-harness/` (runner, suites, policies, fixtures), CI self-test job.
- **Acceptance:** Passes the template app; fails every fixture in `packages/verification-harness/fixtures/` for the expected reason; same input gives the same result hash.
- **Verification:** Self-test job in CI.
- **Risks:** Suites too tied to one app shape. Mitigation: the contract is the only coupling.
- **Complexity:** M

## P3. Factory Engine core (Nov 21–25)
- **Objective:** Persistent run orchestration, testable without Kiro.
- **Scope:** Engine schema, spec/plan Zod schemas, run state machine with resume, evidence store with hash chain and redaction, approvals bound to content hash, Fastify API with SSE, operator auth reusing `packages/application-foundation`.
- **Dependencies:** P0, P1 (auth), P2-01 (gate interface).
- **Deliverables:** `services/factory-engine`.
- **Acceptance:** A scripted fake agent walks a run from DEFINED to AWAITING_APPROVAL; illegal transitions are rejected; restarting the Engine mid-run resumes it.
- **Verification:** Property tests on transitions, crash/resume integration test.
- **Risks:** Over-building the workflow engine. Keep it one table plus a transition function.
- **Complexity:** M

## P4. Kiro + sandbox (Nov 22–26)
- **Objective:** Kiro edits code in an isolated container and Lathe gets a diff back.
- **Scope:** Adapter for the path chosen in P0, hardened sandbox image, egress allow-list proxy, worktree prep that excludes `packages/verification-harness/` and `.github/`, diff collection, runtime agent configs (planner, builder, repair), timeouts and cancel.
- **Dependencies:** P0-04, P3-02.
- **Deliverables:** `integrations/kiro/` (adapter in `src/`, sandbox runner in `src/sandbox/`, fake ACP server, `agents/`, `sandbox-image/`).
- **Acceptance:** A trivial task produces a diff; the sandbox cannot read host env, reach non-allowed hosts, or see `packages/verification-harness/`; all events persisted.
- **Verification:** Fake ACP server tests on every PR; real-Kiro smoke test run manually; sandbox checks scripted.
- **Risks:** Kiro endpoints for the allow-list unknown (find in P0 spike); Docker networking on WSL2.
- **Complexity:** M

## P5. Build → Verify → Repair, and the demo (Nov 25–28)
- **Objective:** Prove the thesis end to end.
- **Scope:** Planner step with human plan approval, builder step, verification in a fresh container on a clean tree, repair loop (max 3 attempts), opt-in demo fault injection, adversarial self-certification tests, **P5-07 vertical slice**.
- **Dependencies:** P2, P3, P4; P8-01 and P9-04, P9-05, P9-06 for P5-07.
- **Deliverables:** Pipeline in `services/factory-engine`, `specs/kb-articles.md`, rehearsal script.
- **Acceptance:** The 10 criteria in TASKLIST P5-07.
- **Verification:** E2E with scripted fake agent on every PR; real-Kiro rehearsal at least 3 times before Dec 1 with recorded evidence.
- **Risks:** Kiro nondeterminism makes the repair not converge. Mitigation: bounded scope module, precise failure evidence, rehearsals, and an honest "escalated to human" path that is also a valid demo outcome.
- **Complexity:** M

## P6. Support Desk (Nov 20–29, parallel)
- **Objective:** First app from the template.
- **Scope:** Tickets, assignments, SLA by priority with breach status, approvals (no self-approval), roles requester/agent/admin, seeded demo data. Knowledge Base module built by Lathe in P5-07.
- **Dependencies:** P1; P2 for verification.
- **Deliverables:** `apps/support-desk/`.
- **Acceptance:** Full harness passes; SLA property tests pass.
- **Risks:** Skeleton gaps. Fix in `packages/application-foundation`, never by copying code into the app.
- **Complexity:** M

## P7. Team Operations (Nov 23–29, parallel)
- **Objective:** Second, distinct app proving skeleton flexibility.
- **Scope:** Hierarchical scopes org → team → project in `packages/application-foundation` (opt-in, explicit deny wins), teams, projects, tasks, shared resources.
- **Dependencies:** P1, P6 lessons.
- **Deliverables:** `apps/team-operations/`, hierarchy module in `packages/application-foundation`.
- **Acceptance:** Both apps use the same `packages/application-foundation` version; both pass the harness after the hierarchy change.
- **Risks:** Hierarchy change breaks Support Desk. CI runs both apps' suites on any skeleton change.
- **Complexity:** M

## P8. GitHub delivery (Nov 26–28)
- **Objective:** Verified run becomes a draft PR with evidence.
- **Scope:** Octokit with a fine-grained token held only by the Engine, branch/commit/draft PR, evidence summary in PR body plus evidence JSON committed under `.lathe/evidence/<run>/`, CI workflow running `lathe-verify`, PR status polling.
- **Dependencies:** P5-03.
- **Deliverables:** `integrations/github/src`, `.github/workflows/verify.yml`.
- **Acceptance:** PR is created as draft; main is protected; Engine has no merge path.
- **Complexity:** S

## P9. UX/UI, Landing Page and Factory Workspace (design system Nov 17–19, Workspace Nov 22–30, landing final Dec 1)
- **Objective:** A complete product experience: a public landing page, an authenticated Workspace and an operational dashboard, all on real Engine data.
- **Scope:** P9-00 design system and wireframes; P9-01 landing page; P9-02 shell and navigation; P9-03 dashboard; P9-04 project workspace; P9-05 live run view; P9-06 verification and delivery view; P9-07 polish and accessibility (Should); P9-08 read-only replay (Could). One Next.js app with `(marketing)` and `(app)` route groups sharing tokens and `components/ui` (D17). Apps keep their own template UI (D18).
- **Out of scope:** pricing, accounts for the public site, any Engine access from the landing page, a shared UI package, deploy or merge buttons.
- **Dependencies:** P0-02 for the design system; P3-04 API and contracts C4 for the Workspace; P5-03/P5-04 for live runs; P8-01 for delivery.
- **Deliverables:** `docs/design/{design-system,wireframes,landing-claims}.md`, `apps/workspace/` with both route groups.
- **Acceptance:** P5-07 steps 1 to 3 and 10 are performed in the UI. Dashboard numbers equal Engine data. Landing page claims each map to an existing artifact. No simulated agent activity is shown as real.
- **Verification:** Playwright against the real Engine, link and claim checks, contrast tests, tamper test for evidence, request audit proving the marketing routes never call the Engine.
- **Risks:** **Frontend capacity.** About 14 UI tasks fall in 18 days for one role: P9-00 to P9-08, plus P1-07 (template), P6-05 and P7-04 (app UIs). Mitigation: a design system first; two or three frontend sessions on disjoint paths (`(marketing)`, `(app)`, and app UIs); backend delivers contract C4 early, including `GET /v1/overview`. If behind, cut in this order: P9-08, P9-07, landing page showcase and architecture visuals, Agents and Settings pages reduced to minimal real-data views, dashboard widgets beyond running builds and pending approvals. Never cut P9-02, P9-04, P9-05, P9-06, which the demo needs. Second risk: landing copy or screenshots overclaiming. Mitigation: `docs/design/landing-claims.md`, human sign-off.
- **Complexity:** L
## P10. Deploy and submit (Nov 29–Dec 3)
- **Objective:** Eligible, judgeable submission.
- **Scope:** Host both apps with seeded demo tenants, security checklist, README with judge instructions, Kiro usage write-up, video, Devpost form.
- **Acceptance:** Public repo with detectable license and committed `/.kiro`; both URLs work with demo credentials; video under 3 minutes is public on YouTube; submitted by Dec 3.
- **Complexity:** S
