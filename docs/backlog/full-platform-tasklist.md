# Task List

All tasks are **Proposed / not started**. Priority: P0 critical path, P1 important, P2 later. "Agent" is the development-time role (Kiro IDE/Crew) that owns the task. Roles: `architect`, `platform`, `backend`, `frontend`, `security`, `verification`, `devops`, `docs`.

Format per task: **ID. Title**: description. Pri | Phase | Deps | Agent | Files | Acceptance | Tests.

---

## Phase 0: Bootstrap

**P0-01. Initialize repository**: git init, `.gitignore`, `.editorconfig`, `.nvmrc` (Node 22), license placeholder. Pri P0 | P0 | none | platform | `.gitignore`, `.nvmrc`, `.editorconfig` | Clean `git status`, first commit | none (config only; CI covers in P0-03).

**P0-02. Monorepo scaffold**: pnpm workspace, Turborepo, shared `tsconfig.base.json` (strict), ESLint, Prettier, Vitest root config, empty packages per ARCHITECTURE.md §9. Pri P0 | P0 | P0-01 | platform | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `packages/*/package.json` | `pnpm install`, `typecheck`, `lint`, `test` succeed | One trivial real test per package proving the runner works.

**P0-03. CI skeleton and CODEOWNERS**: GitHub Actions for typecheck/lint/test; CODEOWNERS covering protected paths. Pri P0 | P0 | P0-02 | devops | `.github/workflows/ci.yml`, `.github/CODEOWNERS` | CI green on main; PR touching `harness/` requests owner review | Open test PR touching protected path.

**P0-04. ADRs for D1-D9**: one ADR per decision after approval. Pri P0 | P0 | approval | architect | `docs/adr/0001..0009-*.md` | Each ADR has context, options, decision, consequences | Peer review.

**P0-05. Kiro ACP spike**: pin Kiro CLI version, authenticate (API key or login), script performing `initialize`, `session/new`, one `session/prompt` in a temp dir, log all events; also test `--trust-tools` behaviour and `session/cancel`. Pri P0 | P0 | P0-02 | backend | `docs/spikes/kiro-acp.md`, `scripts/spikes/acp-handshake.ts` | Documented: working version, auth method, event shapes, automation-terms conclusion | Script re-runnable; output attached to doc.

**P0-06. Evaluate `kiro-cli serve` and headless as fallback**: short comparison from real runs. Pri P1 | P0 | P0-05 | backend | `docs/spikes/kiro-alternatives.md` | Recommendation confirmed or changed | Reproducible commands in doc.

## Phase 1: Foundation v0

**P1-01. Foundation DB schema**: users, organizations, memberships, roles, role_permissions, audit_events; migrations. Pri P0 | P1 | P0-02 | backend | `packages/foundation/src/db/*`, `migrations/` | Migrations apply/rollback on clean Postgres | Migration up/down test in Docker Postgres.

**P1-02. Tenant context and RLS helpers**: per-transaction `SET LOCAL app.org_id`, non-owner role, FORCE RLS template for tenant tables. Pri P0 | P1 | P1-01 | security | `packages/foundation/src/tenancy/*` | Query without context returns zero rows; wrong org returns zero rows; pooled connection does not leak context | Integration tests with real Postgres, concurrent connection test.

**P1-03. Authentication**: sessions and credential handling (choose password+argon2 or OIDC per ADR), CSRF, rate limit. Pri P0 | P1 | P1-01 | security | `packages/foundation/src/auth/*` | Login, logout, session expiry work; no secrets in logs | Unit + integration; negative tests for fixation/expiry.

**P1-04. Organizations and memberships API**: create org, invite, accept, remove, change role. Pri P0 | P1 | P1-02, P1-03 | backend | `packages/foundation/src/orgs/*` | Last owner cannot be removed; membership scoped to org | Unit + integration + tenant tests.

**P1-05. RBAC and `can()`**: role→permission model, deny-by-default decision function, handler wrapper requiring declared permission. Pri P0 | P1 | P1-04 | security | `packages/foundation/src/authz/*` | Undeclared permission = build failure; unknown role = deny | Unit, property tests (no permission granted without explicit grant).

**P1-06. Audit events**: append-only table (no UPDATE/DELETE grants), written in same tx as change. Pri P0 | P1 | P1-02 | backend | `packages/foundation/src/audit/*` | Failed tx leaves no audit orphan; UPDATE/DELETE denied | Integration tests.

**P1-07. Foundation reference app and docs**: minimal app wiring foundation; `docs/foundation.md` with security conventions. Pri P1 | P1 | P1-05, P1-06 | docs | `examples/foundation-ref/`, `docs/foundation.md` | New app can adopt foundation following docs only | Build and run reference app in CI.

## Phase 2: Verification Harness

**P2-01. Gate result schema and runner**: Zod schema for gate results, runner executing gates in order, result hashing (commit, harness hash, policy hash). Pri P0 | P2 | P0-02 | verification | `packages/verification/src/{runner,schema}.ts` | Same inputs → same hash; failures preserve raw output | Unit; determinism test.

**P2-02. Protected-path diff check**: reject diffs touching protected globs (incl. renames, symlinks, mode changes). Pri P0 | P2 | P2-01 | security | `packages/verification/src/protected-paths.ts`, `policies/protected-paths.json` | All bypass attempts fail (case, `..`, symlink, rename) | Table-driven tests with adversarial diffs.

**P2-03. Build, type, lint gates**: run against target app in isolated container. Pri P0 | P2 | P2-01 | verification | `packages/verification/src/gates/build.ts` | Failing type error fails gate | Fixture apps (good/bad).

**P2-04. Unit/integration test gate with integrity checks**: run tests; detect deleted/skipped tests and coverage drop versus baseline. Pri P0 | P2 | P2-03 | verification | `.../gates/tests.ts` | `.skip`/deleted tests flagged | Fixtures with weakened tests.

**P2-05. Tenant isolation conformance suite**: generic suite that discovers tenant tables/routes and tests cross-tenant read, list, update, delete, ID guess. Pri P0 | P2 | P1-02 | verification | `harness/tenant-isolation/*` | Detects planted missing-`org_id` filter and missing RLS | Fixture apps with seeded leaks.

**P2-06. RBAC matrix and deny-by-default suite**: for each route × role, expected allow/deny from a matrix; undeclared routes fail. Pri P0 | P2 | P1-05 | verification | `harness/rbac/*` | Detects route without permission and over-permissive role | Seeded-bug fixtures.

**P2-07. Property-based suite**: fast-check models for authz invariants (no escalation, deny wins, tenant never crosses). Pri P1 | P2 | P2-06 | verification | `harness/properties/*` | Seeds recorded; failures reproducible | Self-tests with known-bad models.

**P2-08. Security gates**: dependency audit, secret scan, SAST (semgrep rules for raw SQL without params, missing authz). Pri P1 | P2 | P2-01 | security | `packages/verification/src/gates/security.ts`, `policies/semgrep/` | Planted secret and SQL injection found | Fixtures.

**P2-09. Harness self-test corpus**: "N known bugs must be caught" CI job. Pri P0 | P2 | P2-02..P2-08 | verification | `tests/harness-selftest/*` | CI fails if any known bug passes the harness | The corpus itself.

**P2-10. `lathe-verify` CLI**: runs full gate set locally and in CI. Pri P1 | P2 | P2-09 | verification | `packages/verification/bin/lathe-verify.ts` | Exit code and JSON report match gate results | CLI tests.

## Phase 3: Factory Engine core

**P3-01. Engine DB schema**: projects, specs, plans, tasks, runs, run_events, gate_results, approvals, evidence_refs. Pri P0 | P3 | P0-02 | backend | `packages/engine-db/*` | Migrations apply; constraints for state validity | Migration tests.

**P3-02. Spec and task schemas**: Zod types, versioning, validation of acceptance checks. Pri P0 | P3 | P3-01 | architect | `packages/shared/src/spec.ts`, `plan.ts` | Invalid specs rejected with clear errors | Unit + property (round-trip).

**P3-03. Run state machine**: states per ARCHITECTURE.md; transitions code-enforced; persisted event log; only Engine can set VERIFIED. Pri P0 | P3 | P3-01 | backend | `packages/engine-core/src/orchestrator/*` | Illegal transitions throw; resume after crash | Property tests over transition sequences; crash/resume test.

**P3-04. Evidence store**: append-only, content-hashed, per-run hash chain, size limits, secret redaction. Pri P0 | P3 | P3-01 | security | `packages/evidence/*` | Tamper detection works; secrets redacted | Unit + tamper tests.

**P3-05. Approvals**: record human approval (who, what hash, when) for spec, plan, delivery; approval bound to content hash. Pri P0 | P3 | P3-03 | backend | `packages/engine-core/src/approvals/*` | Changed spec invalidates approval | Unit + integration.

**P3-06. Engine API and auth**: Fastify routes, OIDC/session auth for operators, RBAC reuse of foundation. Pri P0 | P3 | P3-03, P1-05 | backend | `apps/engine/src/api/*` | All routes need permission; OpenAPI generated | Contract tests; deny-by-default suite on Engine itself.

**P3-07. Task graph planner validation**: DAG checks (cycles, missing deps, every task has acceptance checks). Pri P1 | P3 | P3-02 | backend | `packages/engine-core/src/planner/*` | Cycle rejected | Unit + property tests.

## Phase 4: Kiro integration and sandbox

**P4-01. Adapter interface and ACP client**: `KiroAdapter`; JSON-RPC over stdio; initialize/new/prompt/cancel; typed events; timeouts. Pri P0 | P4 | P0-05, P3-03 | backend | `packages/kiro-adapter/src/*` | Passes against fake ACP server and real CLI smoke | Unit with fake server; recorded-transcript tests; real-CLI smoke (manual CI job).

**P4-02. Sandbox runner**: Docker with non-root, no-new-privileges, cap drop, read-only root, resource limits, egress allow-list, no Docker socket. Pri P0 | P4 | P0-02 | security | `packages/sandbox/*`, `infra/sandbox/Dockerfile` | Escape-checklist tests pass | Tests that try reading host env, writing protected paths, reaching blocked host.

**P4-03. Worktree and diff collection**: clean checkout, protected paths excluded/read-only, produce canonical patch. Pri P0 | P4 | P4-02, P2-02 | backend | `packages/sandbox/src/worktree.ts` | Patch applies to clean tree reproducibly | Unit + integration.

**P4-04. Kiro agent configs and prompt templates**: builder, repair, spec, planner, review agents with scoped tools; steering for generated apps (use foundation, declare permissions). Pri P0 | P4 | P4-01 | architect | `agents/*.json`, `agents/prompts/*`, `agents/steering/*` | Configs load in pinned CLI; tool lists minimal | Load test in CLI; prompt-injection regression cases.

**P4-05. Event persistence and live stream**: store ACP events as evidence; stream to API (SSE). Pri P1 | P4 | P4-01, P3-04 | backend | `packages/engine-core/src/agent-runtime/*` | Events ordered and complete | Integration test with fake server.

**P4-06. Budgets and cancellation**: time, token/step budget, `session/cancel`, kill on overrun. Pri P1 | P4 | P4-01 | backend | `.../agent-runtime/budget.ts` | Runaway agent killed, run marked accordingly | Fake agent that never ends.

## Phase 5: Build-verify-repair pipeline

**P5-01. Spec-agent and planner-agent flow**: draft → schema validation → human approval. Pri P0 | P5 | P3-05, P4-04 | backend | `packages/engine-core/src/intake/*` | Invalid agent output retried then escalated | Fake-agent tests.

**P5-02. Builder task execution**: per-task session, diff, protected-path check, quick gates. Pri P0 | P5 | P4-03, P2-03 | backend | `packages/engine-core/src/agent-runtime/build.ts` | Task diffs accepted only when checks pass | E2E with scripted fake agent.

**P5-03. Verification orchestration**: fresh verifier container, apply patch, run gates, record signed result. Pri P0 | P5 | P2-10, P3-04 | backend | `packages/engine-core/src/gates/*` | Agent container is gone before verify; results hash-bound | Integration tests.

**P5-04. Repair loop**: feed only failing output to repair-agent; max attempts; repeat-failure escalation. Pri P0 | P5 | P5-03 | backend | `packages/engine-core/src/repair/*` | Stops at max; escalates on repeat | Fake agent fixing/not fixing.

**P5-05. Adversarial self-certification tests**: fake agent that edits harness, edits policy, deletes tests, prints "all tests passed". Pri P0 | P5 | P5-04 | verification | `tests/e2e/adversarial/*` | All attempts rejected; run never reaches AWAITING_APPROVAL | The tests themselves.

**P5-06. First real run on 1-entity spec**: Kiro builds a tiny tenant-scoped CRUD on foundation. Pri P0 | P5 | P5-05 | architect | `specs/smoke.md`, `generated/smoke/` | All gates pass with real Kiro; evidence stored | Nightly E2E job.

## Phase 6: Support Desk

**P6-01. Support Desk spec**: tickets, assignments, SLA, approvals, roles/permissions, with acceptance checks. Pri P0 | P6 | P5-06 | architect | `specs/support-desk.md` | Human-approved spec | Schema validation.

**P6-02. Generate ticket core and assignments**: Pri P0 | P6 | P6-01 | backend | `generated/support-desk/src/tickets/*` | Gates pass | Full harness.

**P6-03. SLA policies and timers**: deterministic clock injection. Pri P1 | P6 | P6-02 | backend | `generated/support-desk/src/sla/*` | Breach calculation correct across business hours | Property tests with fake clock.

**P6-04. Approval workflow**: Pri P1 | P6 | P6-02 | backend | `generated/support-desk/src/approvals/*` | Requester cannot approve own request | Integration + authz tests.

**P6-05. Support Desk conformance additions**: app-specific role matrix and isolation cases. Pri P0 | P6 | P6-04 | verification | `harness/apps/support-desk/*` | Seeded leaks caught | Fixture mutations.

## Phase 7: Team Operations

**P7-01. Team Operations spec**: Pri P0 | P7 | P5-06 | architect | `specs/team-operations.md` | Approved spec | Schema validation.

**P7-02. Hierarchical permissions in foundation**: org→team→project scope chain, inheritance, explicit deny. Pri P0 | P7 | P1-05 | security | `packages/foundation/src/authz/hierarchy.ts` | Deny wins; no escalation via nesting | Property tests; re-run Support Desk suite.

**P7-03. Generate projects, tasks, teams**: Pri P0 | P7 | P7-01, P7-02 | backend | `generated/team-operations/src/*` | Gates pass | Full harness.

**P7-04. Shared resources**: cross-team sharing within org only. Pri P1 | P7 | P7-03 | backend | `generated/team-operations/src/resources/*` | Sharing never crosses tenants | Isolation suite extension.

**P7-05. Foundation reuse check**: both apps pinned to the same foundation version; CI fails on fork/copy. Pri P1 | P7 | P7-03, P6-02 | verification | `policies/foundation-reuse.json` | Copy of foundation code detected | Fixture.

## Phase 8: GitHub delivery

**P8-01. GitHub App and client**: minimal scopes, installation token minting, webhook signature verification. Pri P0 | P8 | P5-03 | backend | `packages/github-delivery/src/client.ts` | Tokens short-lived; spoofed webhook rejected | Unit + integration on test repo.

**P8-02. Branch, commit, draft PR**: branch naming, commit message with run ID, PR body with evidence summary. Pri P0 | P8 | P8-01 | backend | `packages/github-delivery/src/pr.ts` | PR created as draft with links to evidence | Integration on test repo.

**P8-03. CI workflow running gates**: trusted workflow from base branch; required checks. Pri P0 | P8 | P2-10 | devops | `.github/workflows/verify.yml` | PR cannot merge without checks | Negative test PR.

**P8-04. CI vs local result reconciliation**: mismatch blocks delivery. Pri P1 | P8 | P8-03 | backend | `packages/github-delivery/src/reconcile.ts` | Mismatch flagged | Unit.

**P8-05. Branch protection documentation and setup check**: Engine verifies protection is enabled before delivering. Pri P1 | P8 | P8-01 | security | `docs/github-setup.md` | Delivery refuses on unprotected repo | Integration.

## Phase 9: Workspace UI

**P9-01. Workspace shell and auth**: Pri P1 | P9 | P3-06 | frontend | `apps/workspace/*` | Login, nav, deny-by-default routes | Playwright.

**P9-02. Projects and specs views**: Pri P1 | P9 | P9-01 | frontend | `apps/workspace/src/projects/*` | Create/edit/approve spec | Playwright.

**P9-03. Runs, live agent activity, gates, evidence**: Pri P1 | P9 | P9-01, P4-05 | frontend | `apps/workspace/src/runs/*` | Shows only real engine state | Playwright vs real Engine.

**P9-04. Delivery and approvals view**: PR status, approve actions. Pri P1 | P9 | P8-02, P9-03 | frontend | `apps/workspace/src/delivery/*` | Approve is bound to content hash | Playwright.

## Phase 10: Hardening and deployment

**P10-01. Threat-model review**: against implemented system. Pri P0 | P10 | P1-P9 | security | `docs/security/threat-model.md` | No open high findings | Review sign-off.

**P10-02. Sandbox hardening evaluation (gVisor)**: Pri P1 | P10 | P4-02 | security | `docs/adr/00xx-sandbox.md` | Decision recorded with measurements | Escape tests rerun.

**P10-03. Deployment infra**: Dockerfiles, compose/IaC, secrets manager integration. Pri P0 | P10 | P3-06, P9-01 | devops | `infra/*` | Fresh environment deploys from docs | Deploy rehearsal.

**P10-04. Observability and backup/restore**: Pri P1 | P10 | P10-03 | devops | `infra/observability/*`, `docs/runbooks/*` | Restore drill passes | Drill.

**P10-05. Chaos and load tests**: kill engine mid-run, many concurrent runs, cost limits. Pri P1 | P10 | P10-03 | verification | `tests/chaos/*` | Runs resume, no orphaned sandboxes | Tests themselves.
