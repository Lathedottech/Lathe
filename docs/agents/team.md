# Agent team: responsibilities, ownership, coordination

Status: Proposed. Awaiting human review (task P0-08). No implementation task starts before approval.
Agent definitions: `.kiro/agents/*.md`. Rules for the team: `.kiro/steering/` (routed from `AGENTS.md`).

## 1. Responsibility matrix

**W** writes the code or document and files the task report. **R** reviews and re-runs tests (writes `docs/reviews/`). **C** consulted before the change. **A** human approves. Blank means no role.

| Area | architect | backend | frontend | kiro-integration | security | verification | devops | documentation |
|---|---|---|---|---|---|---|---|---|
| Architecture, ADRs, contracts C1–C4 | **W**, A | C | C | C | C | C | C | |
| Skeleton core (schema, tenancy, auth, orgs, authz, audit) | R | **W** | | | **R (veto)** | C | | |
| Skeleton template + new-app script | R | C | **W** | | | | | |
| Verification harness (`packages/verification-harness/`) | R | C | | | R | **W** | | |
| Engine core (state machine, evidence, approvals, API) | R | **W** | | | R | C | | |
| Kiro adapter, sandbox, worktree, runtime agent configs | R | C | | **W** | **R (veto)** | | C | |
| Pipeline (plan, build, verify, repair, fault injection) | R | **W** | | C | R | C | | |
| Adversarial self-certification tests | R | C | | C | R | **W** | | |
| Support Desk / Team Ops domain logic | R | **W** | | | R (authz parts) | C | | |
| Support Desk / Team Ops / template UI | R | C | **W** | | | | | |
| Workspace UI, dashboard, design system, landing page | R (human signs off landing claims) | C | **W** | | | | | |
| GitHub delivery code | R | **W** | | | **R (veto)** | | C | |
| CI, repo scaffold, infra, deploy, hooks | R | | | | R | C | **W** | |
| Security docs and checklist | A | | | | **W** | | | |
| README, setup, diagrams, demo runbook, Kiro write-up | C | | | | | | | **W** |
| Task status in TASKLIST.md | | | | | | | | **W** |

## 2. Principles

- **Single writer per path.** Ownership is by path, not by agent instance. Two sessions of the same role may run in parallel if their paths are disjoint.
- **Interfaces before implementation.** `architect` freezes contracts C1–C4 (task P0-07). Consumers build against them using fakes. A frozen contract changes only by handoff request, `architect` approval, and notice to every consumer.
- **Builder is not verifier.** The role that writes code never writes the gate that judges it. `verification` owns gates. `security` owns no source.
- **Evidence, not claims.** A task is Done only with a report containing real command output and an approving review. `documentation` records status.

## 3. Path ownership

| Path | Owner | Notes |
|---|---|---|
| `AGENTS.md`, `ARCHITECTURE.md`, `docs/adr/**`, `.kiro/agents/**`, `.kiro/steering/**`, `.kiro/specs/**`, `docs/agents/**` | architect | Human approves content |
| `packages/shared-contracts/**` | architect | Single-writer. Everyone else consumes (types and Zod only) |
| `services/factory-engine/**` (db, domain, orchestrator, pipeline, evidence, approvals, api, `src/main.ts`, tests except `test/adversarial/`) | backend | `security` reviews evidence, approvals and API auth |
| `services/factory-engine/test/adversarial/**` | verification | |
| `integrations/kiro/**` (adapter, fake ACP server, sandbox runner, runtime agent configs, sandbox image), `scripts/spikes/**`, `docs/spikes/**` | kiro-integration | `security` reviews all changes. Whole package including its `package.json` |
| `integrations/github/**` | backend | `security` reviews all changes |
| `packages/application-foundation/**` | backend | `src/{tenancy,authz,auth}` need `security` approval (CODEOWNERS) |
| `templates/app-starter/src/{app,components,styles}/**`, `templates/app-starter/package.json`, `scripts/new-app.ts` | frontend | |
| `apps/support-desk/src/{tickets,sla,approvals,kb,db}/**`, `apps/team-operations/src/{teams,projects,tasks,resources,db}/**`, migrations, app `package.json` | backend | |
| `apps/support-desk/src/{app,components,styles}/**`, `apps/team-operations/src/{app,components,styles}/**` | frontend | |
| `apps/workspace/**` (routes `(marketing)` and `(app)`), `docs/design/**`, `tests/e2e/**` | frontend | |
| `packages/verification-harness/**`, `tests/harness-selftest/**` | verification | **Protected.** Nobody else writes |
| `.github/**`, `.kiro/hooks/**` | devops | **Protected.** Verification workflow content is requested by handoff from `verification` |
| `.kiro/settings/mcp.json` | architect | Added only after a recorded decision; devops reviews secrets handling |
| Root config, lockfile, `infra/**` except `infra/deploy/**`, `scripts/**` except those above | devops | Person B |
| `specs/**` (product specs that Lathe runs; not `.kiro/specs/`) | architect (spec author) | Person C writes; A approves each spec |
| `infra/deploy/**`, `tests/e2e/deploy-smoke/**`, `tests/e2e/deployed/**` | devops (deploy), verification (black-box checks) | Person C. Checks never import harness code; they may run `lathe-verify` as a process. `security` and `architect` review, B consulted |
| `docs/judge-guide.md` | documentation | Person C |
| `SECURITY.md`, `docs/security/**` | security | |
| `README.md`, `CONTRIBUTING.md`, `ROADMAP.md`, `IMPLEMENTATION_PLAN.md`, `TASKLIST.md` (status), `docs/architecture/**`, `docs/demo/**`, `docs/setup/**`, `docs/kiro-usage.md`, `docs/backlog/**`, `packages/application-foundation/README.md` | documentation | |
| `docs/reports/**`, `docs/handoffs/**` | any role (own files only) | Name files with your role |
| `docs/reviews/**` | architect, security, verification | One file per review |

`pnpm-lock.yaml` is generated. Nobody hand-edits it. On a conflict, rebase and re-run `pnpm install`. `devops` creates each package's `package.json` and `tsconfig.json` at scaffold time; after that, the folder's owner edits dependencies in their own `package.json` and states the reason in the report. Each integration is its own package, so `kiro-integration` no longer needs a handoff to change dependencies. Dependencies with security impact need human approval.

Where a role needs a change in a file it does not own (for example `verification` needs a workflow in `.github/`), it files a handoff request. The Kiro profiles enforce part of this with `fs_write` allow rules for owned paths and `deny` rules for protected paths. Profiles cannot cover everything, so the ownership rule in `.kiro/steering/agent-workflow.md` still applies.
## 4. Coordination and handoff rules

The rules live in one place: [.kiro/steering/agent-workflow.md](../../.kiro/steering/agent-workflow.md) (task lifecycle, shared-file restrictions, parallel execution, handoffs, completion evidence, failure reporting). Reviewers per task: [task-ownership.md](task-ownership.md). Waves and gates: [workstreams.md](workstreams.md). Not repeated here.

## 4b. Humans

Three people drive the agent team: **A** (lead, architect), **B** (fullstack) and **C** (release and platform readiness, Marouan Ben, added Nov 27). C owns `specs/**`, `infra/deploy/**`, `tests/e2e/**`, `docs/setup/**`, `docs/security/**`, `docs/demo/**`, `docs/kiro-usage.md`, `docs/judge-guide.md`, `README.md` from Nov 30, and status edits in `TASKLIST.md`. Status: Proposed. Tracks, human review policy, cadence and cut ladder: [two-person-plan.md](two-person-plan.md).

## 5. Known risks of this team design

| Risk | Mitigation |
|---|---|
| `backend` carries skeleton, Engine, pipeline and app domains: the bottleneck | Run two backend sessions on disjoint paths (`packages/application-foundation/**` vs `services/factory-engine/**`); the architect keeps contracts frozen so they do not block each other |
| Contracts frozen too early are wrong | One revision window after the first real Kiro run (end of W2), via handoff |
| Profiles' `deny` rules may not cover every write path | the ownership rule in `agent-workflow.md` plus CODEOWNERS and the protected-path gate in CI |
| Markdown agent profiles require IDE 1.0 or CLI V3. The installed CLI is 2.7.0 | Use Kiro IDE for dev-time work, or update the CLI (human action). Verify the profiles load before relying on them |
| An agent claims Done without evidence | `documentation` marks Done only with report and review; reviewers re-run tests |
| Reviewer agents agree with authors | Reviewers must re-run tests and attach their own output; `verification` fixtures catch seeded bugs independent of any reviewer |

## 6. Running the team in Kiro

- **Kiro IDE:** pick the agent in the agent selector, or start a session with the agent name. Specs in `.kiro/specs/` drive each phase. Standing steering in `.kiro/steering/` is listed in each agent's `resources`, because custom agents do not receive steering automatically.
- **Kiro Crew:** can dispatch several sessions in parallel. Treat Crew as the development-time conductor only. It is not a Lathe runtime dependency. Check Crew's own docs for how it selects workspace agents before relying on this.
- **Kiro CLI:** `kiro-cli chat --agent <name>` for a single scripted session, once CLI V3 is installed.

None of these three flows has been exercised yet. `docs/kiro-usage.md` records what actually happens.
