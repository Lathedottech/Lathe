# Two-person plan: how A and B work with the agent team

Status: Proposed, awaiting A's approval. Dates assume today is Nov 15, 2026 and submission on Dec 3 (deadline Dec 4, 2:00 PM PST). Both people must be on the Devpost team (up to 3 allowed).

| | **A: project lead and architect** | **B: fullstack developer** |
|---|---|---|
| Track | **Factory**: harness, Engine, Kiro runtime, pipeline, delivery | **Product**: skeleton, both apps, landing page, Workspace |
| Folders | `packages/verification-harness/`, `packages/shared-contracts/`, `services/factory-engine/`, `integrations/kiro/`, `integrations/github/`, `.kiro/` (agents, steering, specs), `docs/adr/` | `packages/application-foundation/`, `templates/app-starter/`, `apps/support-desk/`, `apps/team-operations/`, `apps/workspace/`, `.github/`, `infra/`, root config |
| Agent roles driven | architect, kiro-integration, verification, backend (Engine), security (review) | backend (skeleton, apps), frontend, devops, documentation |
| Tasks | 32 (30 Tier 1, 2 Tier 2) | 31 (25 Tier 1, 5 Tier 2, 1 Tier 3) |
| Decides | Architecture, contracts, ADRs, scope cuts, final say on disagreements | Implementation details inside `packages/application-foundation`, apps and UI; flags problems early |

Per-task assignment, reviewer and tier: [task-ownership.md](task-ownership.md). Each person runs several agent sessions at once, one git worktree per task, so folders must not overlap (they do not).

## Why this split
- A already carries the thesis risk (Kiro go/no-go, verification independence, sandbox) and owns the contracts that connect both tracks.
- B's work is the visible product: judges score Design and need working app URLs. It is mostly independent once contracts C1 (tenant contract) and C4 (Engine API) are frozen.
- The two tracks meet at three points only: the tenant contract C1 (A writes, B's skeleton implements, A's harness consumes), the Engine API C4 (A defines, B's Workspace consumes), and the demo P5-07.

## Shared tasks (do together, day 1–2)
P0-07 contracts C1–C4 (A drafts, B reviews as consumer), the first sync that approves D1–D16, and the P5-07 rehearsals. B's `devops` agent scaffolds the repo (P0-01/02/06) while A writes ADRs, steering and runs the Kiro spike.

## Review policy (replaces "reviewer per task" for humans)
Agent reviewers (`security-agent`, `architect`, `verification-agent`) still re-run tests and write `docs/reviews/` for every task in `task-ownership.md`. Humans cannot read 60 reviews in 18 days, so humans review:
1. **At each gate** (G0 Nov 17, G1 Nov 18, G2 Nov 25, G3 Nov 28): the other person checks the gate criteria are met with real output.
2. **Security-critical tasks** (tenancy, authorization, auth, sandbox, evidence, delivery, protected paths, fault injection): the person who did not drive the task reads the diff and the security review.
   - B's tasks A reads: P1-02, P1-03, P1-04, P1-05, P7-01, P9-02, P9-06, P10-01.
   - A's tasks B reads: P2-02, P2-04, P2-05, P3-03, P3-04, P4-02, P4-03, P4-04, P5-02, P5-03, P5-05, P5-06, P8-01.
3. **Honest weakness:** B is not the domain expert for sandbox and verification internals. For A's security-critical work the independent checks are the `security-agent` review plus the harness fixtures and adversarial tests (P5-06), not B's expertise. Do not describe those tasks as "human security reviewed" in the write-up.

Nobody reviews their own task. Merges go to `main` only by PR with CI green and one human approval (the other person). Only humans merge.

## Decisions
- A approves ADRs, specs, plans and scope cuts. B is informed within the day and can block with a written reason; A decides.
- Decisions still open for A to approve in the first sync: D3 (Kiro auth, decided by the spike), D7 ORM, D8 app UI, D9 app location, D10 auth library, D11 demo module, D12 fault injection, D13 hosting, D14 Engine hosting, D15 GitHub token, D16 license, D17 landing and Workspace structure, D18 design system scope, D19 Ship vs DELIVER wording.

## Rhythm
- **Daily 15-minute sync:** what shipped (with evidence), what is blocked, handoffs needed, cut decisions.
- **Handoffs between people** use `docs/handoffs/` like the agents do, so decisions stay in the repo.
- **Gates:** G0 Nov 17 (repo, CI, ADRs, agent team approved) · G1 Nov 18 (contracts frozen, Kiro path chosen) · G2 Nov 25 (harness passes template app and fails fixtures; fake-agent run completes; Kiro returns a diff) · G3 Nov 28 (P5-07 rehearsal passes with real Kiro). Dec 1 feature freeze.
- **Load check at G2:** if either track is more than two working days behind, apply the cut ladder below that day, not later.

## Backlog board
Keep `TASKLIST.md` as the definition of each task and `task-ownership.md` as the assignment. Track status on one GitHub Project board (columns: Ready, In progress, In review, Done, Blocked), one issue per task ID. Suggested labels: `person:A`, `person:B`, `tier:1|2|3`, `wave:W0…W6`, `role:<agent role>`, `security-critical`. Create the board after P0-01 creates the repository. `documentation-agent` remains the only writer of status in `TASKLIST.md`, taken from reports and reviews.

## Cut ladder (apply in order; each step needs A's decision)
1. P9-08 read-only replay (Tier 3).
2. P9-07 polish and accessibility pass beyond keyboard and contrast basics.
3. P7-03 shared-resources module and P6-03 approval workflow.
4. P8-02 CI verify workflow (the local harness and P0-06 CI remain).
5. P9-03 dashboard reduced to running builds and pending approvals (real data only).
6. P9-02 pages Agents and Settings reduced to minimal real-data views; landing page sections limited to hero, workflow, architecture, apps, Kiro story, footer.
7. P2-07 secret scan and dependency audit.
8. Team Operations scope reduced to teams, projects, tasks with hierarchy (drops shared resources entirely).
Never cut: contracts, harness gates 1–6, sandbox hardening, protected-path enforcement, P5 pipeline, fault injection, the demo, the two apps, deployment, `/.kiro` and the Kiro write-up.

## Capacity risks (real, not solved by this plan)
- After triage, 54 of 61 tasks are Tier 1. Most tasks are small and agent-written, but the schedule has about 1.7 tasks per person per day with review overhead. The plan holds only if contracts are frozen on Nov 18 and agents run in parallel.
- B carries the skeleton (critical path for A's suites) and the whole UI. The skeleton is B's first priority; the landing page is B's last.
- A carries the Kiro go/no-go. If it lands on path D (Kiro on host) or the fallback, the demo changes and A must tell B the same day.
- Crew parallel dispatch is unproven. If it does not work, each person starts separate agent sessions by hand.

## Human-only tasks
Kiro sign-in and credentials, GitHub repository creation and branch protection, approving ADRs, specs and plans, landing-page claims sign-off, recording and uploading the demo video, Devpost submission with demo credentials in the form only. Optional bonus items from the Devpost page: a public blog post and a social post with `#KiroweenHackathon26`, written by a human.
