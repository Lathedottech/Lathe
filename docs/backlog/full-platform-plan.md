# Implementation Plan

Complexity scale: S (days), M (1-2 weeks), L (2-4 weeks), XL (>4 weeks) for one engineer. All phases are Proposed. Nothing is implemented. Phases need approval of decisions D1-D9 in ARCHITECTURE.md §13.

Order rationale: build the judge (foundation conformance + verification) before the builder, so agent output is never accepted without an independent gate.

---

## P0. Bootstrap and decisions
- **Objective:** Repo, tooling, CI skeleton, approved ADRs, Kiro access confirmed.
- **Scope:** git init, pnpm/Turborepo, TS strict config, lint, format, `.github` CI, CODEOWNERS, ADRs for D1-D9, Kiro CLI spike (pin version, login/API key, ACP handshake).
- **Dependencies:** Approval of this blueprint.
- **Deliverables:** Monorepo skeleton, CI green on empty packages, ADRs, `docs/spikes/kiro-acp.md`.
- **Acceptance:** `pnpm install && pnpm typecheck && pnpm test` pass in CI; ACP `initialize` + `session/new` + one prompt succeeds from a script against the pinned CLI.
- **Verification:** CI run; spike script committed and reproducible.
- **Risks:** Kiro API-key/ACP auth or automation terms block runtime use; installed CLI is 2.7.0 and docs describe newer behaviour.
- **Complexity:** S

## P1. Application Foundation v0
- **Objective:** Reusable multi-tenant foundation with deny-by-default authz.
- **Scope:** Users/auth (sessions, password or OIDC), organizations, memberships, roles, permissions, `can()`, RLS helpers, audit events, DB migrations, security conventions doc.
- **Dependencies:** P0.
- **Deliverables:** `packages/foundation`, migrations, example minimal app wiring, `docs/foundation.md`.
- **Acceptance:** Cross-tenant access impossible at DB level even with a buggy query; every handler requires a declared permission; audit event written in same tx.
- **Verification:** Unit, integration against real Postgres, RLS tests with non-owner role, property tests on `can()`.
- **Risks:** RLS bypass via owner role, pooled connection leaking `app.org_id`; auth scope creep.
- **Complexity:** L

## P2. Verification Harness
- **Objective:** Deterministic, agent-independent gates.
- **Scope:** Gate runner and result schema; conformance suites (RBAC matrix, tenant isolation, deny-by-default, authz); property-based; security scans; protected-path diff check; policy files; result hashing.
- **Dependencies:** P1.
- **Deliverables:** `packages/verification`, `harness/`, `policies/`, CLI `lathe-verify`.
- **Acceptance:** Harness passes on a known-good fixture app and fails on a set of deliberately broken fixtures (missing org filter, missing permission, weakened test, edited harness).
- **Verification:** Mutation-style fixture suite ("the harness must catch these N bugs"); results reproducible (same inputs → same hash).
- **Risks:** Conformance suite too coupled to a specific app shape; false confidence.
- **Complexity:** L

## P3. Factory Engine core
- **Objective:** Persistent, resumable run orchestration without agents.
- **Scope:** Engine DB, spec and task schemas, planner validation, run state machine, evidence store, approvals, API, structured logging.
- **Dependencies:** P0, P2 (gate invocation interface).
- **Deliverables:** `apps/engine`, `packages/engine-core`, `engine-db`, `evidence`.
- **Acceptance:** A run with a stub (non-agent) builder walks all states; illegal transitions rejected; restart mid-run resumes.
- **Verification:** State-machine property tests, crash/resume integration test, API contract tests.
- **Risks:** Over-designing workflow engine; keep it a table + transitions.
- **Complexity:** L

## P4. Kiro integration and sandbox
- **Objective:** Run Kiro safely against a task and return a diff.
- **Scope:** `kiro-adapter` (ACP client, event types, cancel, timeouts), custom agent configs, sandbox runner (Docker hardening, mounts, egress allow-list, no creds), diff collector, protected-path enforcement.
- **Dependencies:** P0 spike, P3.
- **Deliverables:** `packages/kiro-adapter`, `packages/sandbox`, `agents/`.
- **Acceptance:** Given a trivial task, Kiro produces a diff inside the sandbox; sandbox cannot read host secrets, reach non-allowed hosts, or write protected paths; events persisted.
- **Verification:** Adapter tests against a recorded/fake ACP server; real-Kiro smoke test (manual-trigger CI); sandbox escape checklist tests.
- **Risks:** ACP version drift; prompt injection from spec content; sandbox on Windows hosts.
- **Complexity:** L

## P5. Build–verify–repair pipeline (end-to-end)
- **Objective:** DEFINE→VERIFY working on a tiny spec.
- **Scope:** spec-agent, planner-agent prompts and validators, builder-agent, repair-agent, bounded repair loop, budgets, escalation.
- **Dependencies:** P2, P3, P4.
- **Deliverables:** Pipeline wiring, prompt/steering templates, budgets in `policies/`.
- **Acceptance:** From a 1-entity spec, Lathe produces code that passes all gates, and a seeded failing case triggers repair then pass or escalation. Agent cannot mark success.
- **Verification:** E2E tests with real Kiro (nightly) and scripted fake agent (every PR); adversarial test where fake agent edits harness is rejected.
- **Risks:** Nondeterminism, cost, loops.
- **Complexity:** L

## P6. Support Desk
- **Objective:** First generated app on the foundation.
- **Scope:** Spec in `specs/support-desk.md`: tickets, assignments, SLA timers, approvals, org roles. Generated through P5.
- **Dependencies:** P5.
- **Deliverables:** `generated/support-desk`, app-specific conformance additions.
- **Acceptance:** All gates pass; tenant A cannot read, list, update, or guess IDs of tenant B tickets; SLA logic covered by property tests.
- **Verification:** Full harness plus SLA property tests plus approval-flow integration tests.
- **Risks:** Foundation gaps discovered; fix in foundation via Lathe, not in the app.
- **Complexity:** L

## P7. Team Operations
- **Objective:** Prove foundation reuse with hierarchical permissions.
- **Scope:** Projects, tasks, teams, shared resources, org→team→project permission inheritance, explicit deny.
- **Dependencies:** P6 (foundation lessons), may start earlier for spec.
- **Deliverables:** `generated/team-operations`, foundation hierarchy extension.
- **Acceptance:** Same foundation package version used by both apps; hierarchy matrix tests pass; both apps pass isolation suite.
- **Verification:** Hierarchy permission property tests (inheritance, deny wins, no escalation).
- **Risks:** Hierarchy changes break Support Desk; run both suites on any foundation change.
- **Complexity:** L

## P8. GitHub delivery
- **Objective:** Verified runs become reviewable PRs.
- **Scope:** GitHub App, branch/commit/PR creation, evidence in PR body, CI workflow, branch protection setup docs, webhook handling, CI-vs-local comparison.
- **Dependencies:** P5.
- **Deliverables:** `packages/github-delivery`, `.github/workflows`.
- **Acceptance:** Run produces draft PR with evidence; merge impossible without required checks and review; Engine never merges.
- **Verification:** Integration tests against a sandbox GitHub repo; negative test for push to protected branch.
- **Risks:** App permission creep; webhook spoofing (verify signatures).
- **Complexity:** M

## P9. Workspace UI
- **Objective:** Operator interface.
- **Scope:** Projects, specs, runs, live agent activity, gates, artifacts, logs, evidence, PR status, approval actions; Engine auth and RBAC.
- **Dependencies:** P3 (API), progressively P5/P8.
- **Deliverables:** `apps/workspace`.
- **Acceptance:** Operator completes DEFINE→DELIVER via UI; UI shows only real Engine state, no placeholder states.
- **Verification:** Playwright E2E, accessibility checks, API contract tests.
- **Risks:** UI drifting ahead of real engine capabilities.
- **Complexity:** L

## P10. Hardening and deployment
- **Objective:** Safe to run for real.
- **Scope:** Threat-model review, secrets management, sandbox hardening (consider gVisor), observability, backup/restore, deploy infra, runbooks, load/cost limits.
- **Dependencies:** P1-P9.
- **Deliverables:** `infra/`, runbooks, security review report.
- **Acceptance:** SECURITY.md checklist all green; restore drill passes; external-style pen test of sandbox and tenant isolation with no high findings.
- **Verification:** Security review, chaos tests (kill engine mid-run), dependency audit.
- **Risks:** Findings force redesign of sandbox.
- **Complexity:** M
