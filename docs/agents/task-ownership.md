# Task ownership mapping

Generated from TASKLIST.md on 2026-11-15 (updated with the P9 UX/UI workstream), then reviewed by hand. Person C (Marouan Ben) was added on Nov 27 with the P11 tasks; P10-01, P10-02 and P10-03 moved to C (P10-04 stays with A). Status of P11: Proposed. If this file and TASKLIST.md disagree, TASKLIST.md wins and documentation fixes this file.

- **Owner** writes the code and the task report (docs/reports/<ID>-<owner>.md).
- **Reviewer** writes docs/reviews/<ID>-<reviewer>.md and re-runs the tests. `security + architect` means both must approve. Tasks owned by `architect`, `security` or `documentation` are approved by the human, because decisions and specs need human approval.
- **Person** is the human who leads the task and drives the agent sessions: **A** = project lead and architect, **B** = fullstack developer, **C** = release and platform readiness (Marouan Ben). The human cross-reviewer is always the other person. See [two-person-plan.md](two-person-plan.md).`n- **Tier** 1 = required for the demo (P5-07) and the submission; 2 = planned but the demo works without it; 3 = cut first. The Pri column is the original MoSCoW label and is kept for reference; Tier decides what to cut.`n- **Wave** is defined in [workstreams.md](workstreams.md).
- `security` never owns source tasks. It owns P10-02, P11-04 and P11-09 (checklist and register, docs only) and reviews.
- Security review is required for every task that touches identity, tenancy, authorization, sandbox, evidence, delivery, protected paths or fault injection.

| ID | Title | Person | Owner (agent role) | Reviewer | Pri | Tier | Due | Depends on | Wave |
|---|---|---|---|---|---|---|---|---|---|
| P0-01 | Repository init | B | devops | architect | Must | 1 | Nov 15 | none | W0 |
| P0-02 | Lean monorepo | B | devops | architect | Must | 1 | Nov 16 | P0-01 | W0 |
| P0-03 | ADRs D1–D6 | A | architect | human | Must | 1 | Nov 16 | approval | W0 |
| P0-04 | Kiro go/no-go spike | A | kiro-integration | architect | Must | 1 | Nov 17 | P0-02 | W1 |
| P0-05 | Dev-time Kiro setup | A | architect | human | Must | 1 | Nov 16 | P0-01 | W0 |
| P0-06 | CI and protection | B | devops | architect | Must | 1 | Nov 17 | P0-02 | W0 |
| P0-07 | Interface contracts C1–C4 | A | architect | human | Must | 1 | Nov 18 | P0-02 | W1 |
| P0-08 | Agent team setup | A | architect | human | Must | 1 | Nov 15 | none | W0 |
| P0-09 | Kiro feature evaluation: Crew, MCP, powers | A | architect | human | Should | 2 | Nov 19 | P0-08, P0-01 | W1 |
| P0-10 | Import-boundary enforcement | B | devops | architect | Must | 1 | Nov 19 | P0-02 | W1 |
| P1-01 | Schema, migrations, audit table | B | backend | architect | Must | 1 | Nov 17 | P0-02 | W2 |
| P1-02 | Tenancy with RLS | B | backend | security + architect | Must | 1 | Nov 18 | P1-01 | W2 |
| P1-03 | Authentication via library | B | backend | security + architect | Must | 1 | Nov 18 | P1-01 | W2 |
| P1-04 | Organizations and memberships | B | backend | security + architect | Must | 1 | Nov 19 | P1-02, P1-03 | W2 |
| P1-05 | Authorization and audit write | B | backend | security + architect | Must | 1 | Nov 19 | P1-04 | W2 |
| P1-06 | Tenant contract | A | architect | human | Must | 1 | Nov 20 | P1-05 | W2 |
| P1-07 | Template app and generator | B | frontend | architect | Must | 1 | Nov 21 | P1-06 | W2 |
| P2-01 | Runner, result schema, CLI, self-test job | A | verification | architect | Must | 1 | Nov 18 | P0-02 | W2 |
| P2-02 | Protected-path check | A | verification | security + architect | Must | 1 | Nov 19 | P2-01 | W2 |
| P2-03 | Build, type, lint, test gates with integrity | A | verification | architect | Must | 1 | Nov 20 | P2-01 | W2 |
| P2-04 | Tenant isolation suite | A | verification | security + architect | Must | 1 | Nov 21 | P1-06, P2-01 | W2 |
| P2-05 | RBAC matrix and deny-by-default | A | verification | security + architect | Must | 1 | Nov 22 | P2-04 | W2 |
| P2-06 | Property-based suite | A | verification | architect | Must | 1 | Nov 22 | P2-05 | W2 |
| P2-07 | Secret scan and dependency audit | A | verification | architect | Should | 2 | Nov 23 | P2-01 | W2 |
| P3-01 | Engine schema and spec/plan types | A | backend | architect | Must | 1 | Nov 21 | P0-02 | W2 |
| P3-02 | Run state machine | A | backend | architect | Must | 1 | Nov 22 | P3-01 | W2 |
| P3-03 | Evidence and approvals | A | backend | security + architect | Must | 1 | Nov 23 | P3-01 | W2 |
| P3-04 | Engine API and SSE | A | backend | security + architect | Must | 1 | Nov 24 | P3-02, P1-05 | W2 |
| P4-01 | Kiro adapter | A | kiro-integration | architect | Must | 1 | Nov 24 | P0-04, P3-02 | W2 |
| P4-02 | Hardened sandbox | A | kiro-integration | security + architect | Must | 1 | Nov 24 | P0-04 | W2 |
| P4-03 | Worktree and diff | A | kiro-integration | security + architect | Must | 1 | Nov 25 | P4-02, P2-02 | W2 |
| P4-04 | Runtime agent configs | A | kiro-integration | security + architect | Must | 1 | Nov 25 | P4-01 | W2 |
| P5-01 | Plan step | A | backend | architect | Must | 1 | Nov 25 | P4-04, P3-03 | W4 |
| P5-02 | Build step | A | backend | security + architect | Must | 1 | Nov 26 | P4-03, P5-01 | W4 |
| P5-03 | Independent verification | A | backend | security + architect | Must | 1 | Nov 26 | P2-01, P5-02 | W4 |
| P5-04 | Repair loop | A | backend | architect | Must | 1 | Nov 27 | P5-03 | W4 |
| P5-05 | Demo fault injection | A | backend | security + architect | Must | 1 | Nov 27 | P5-02 | W4 |
| P5-06 | Self-certification attack tests | A | verification | security + architect | Must | 1 | Nov 27 | P5-04 | W4 |
| P5-07 | Vertical slice demonstration | A | architect | human | Must | 1 | rehearse Nov 28, final by Dec 1 | P5-01..06, P8-01, P9-04, P9-05, P9-06, P6-01 | W5 |
| P6-01 | Scaffold, roles, tickets, assignments | B | backend | architect | Must | 1 | Nov 22 | P1-07 | W2 |
| P6-02 | SLA | B | backend | architect | Must | 1 | Nov 25 | P6-01 | W3 |
| P6-03 | Approvals | B | backend | security + architect | Should | 2 | Nov 27 | P6-01 | W3 |
| P6-04 | Knowledge Base module | B | lathe-runtime | verification (harness) + human PR review | Must | 1 | Nov 28 | P5-07 | W5 |
| P6-05 | Support Desk UI | B | frontend | architect | Must | 1 | Nov 28 | P6-02 | W4 |
| P7-01 | Hierarchical scopes in skeleton | B | backend | security + architect | Must | 1 | Nov 24 | P1-05 | W3 |
| P7-02 | Scaffold, teams, projects, tasks | B | backend | architect | Must | 1 | Nov 26 | P7-01, P1-07 | W3 |
| P7-03 | Shared resources module | B | lathe-runtime | verification (harness) + human PR review | Should | 2 | Nov 29 | P7-02, P5-07 | W4 |
| P7-04 | Team Operations UI | B | frontend | architect | Must | 1 | Nov 29 | P7-02 | W4 |
| P8-01 | Branch, commit, draft PR | A | backend | security + architect | Must | 1 | Nov 27 | P5-03 | W4 |
| P8-02 | CI verify workflow | B | devops | architect | Should | 2 | Nov 28 | P2-01, P0-06 | W4 |
| P9-00 | UX/UI design system and wireframes | B | frontend | architect | Must | 1 | Nov 19 | P0-02 | W2 |
| P9-01 | Public landing page | B | frontend | human (claims audit) + architect | Must | 1 | skeleton Nov 22, final Dec 1 | P9-00 (build), P9-03 and P9-06 (real screenshots) | W5 |
| P9-02 | Workspace shell and navigation | B | frontend | security + architect | Must | 1 | Nov 25 | P9-00, P3-04 | W3 |
| P9-03 | Factory Dashboard | B | frontend | architect | Must | 2 | Nov 27 | P9-02, P3-04 | W4 |
| P9-04 | Factory project workspace | B | frontend | architect | Must | 1 | Nov 27 | P9-02, P3-04, P5-01 | W4 |
| P9-05 | Live factory run experience | B | frontend | architect | Must | 1 | Nov 28 | P9-04, P3-04, P5-03, P5-04 | W4 |
| P9-06 | Verification and delivery interface | B | frontend | security + architect | Must | 1 | Nov 30 | P9-05, P8-01, P3-03 | W5 |
| P9-07 | Responsive polish and accessibility | B | frontend | architect | Should | 2 | Dec 2 | P9-01, P9-02, P9-03, P9-04, P9-05, P9-06 | W5 |
| P9-08 | Read-only replay mode | B | frontend | architect | Could | 3 | Dec 2 | P9-06 | W5 |
| P10-01 | Deploy apps and landing page | C | devops | security + architect (B consulted) | Must | 1 | Nov 30 | P6-02, P7-02 | W6 |
| P10-02 | Security checklist | C | security | human (A approves) | Must | 1 | Dec 1 | all Must | W6 |
| P10-03 | README, judge guide, Kiro write-up | C | documentation | human | Must | 1 | Dec 2 | P10-01 | W6 |
| P10-04 | Video and submission | A | documentation | human | Must | 1 | Dec 3 | P5-07, P10-03 | W6 |
| P11-01 | Demo product spec: Support Desk Knowledge Base | C | architect | human (A approves) | Must | 1 | Nov 28 | P3-01 | W5 |
| P11-02 | Local setup guide and fresh-machine dry run | C | documentation | human | Must | 1 | Nov 28 | none | W5 |
| P11-03 | Deploy artifacts and prod-like local run | C | devops | security + architect (B consulted) | Must | 1 | Nov 29 | P6-02, P7-02 | W5 |
| P11-04 | Security checklist draft and open-findings register | C | security | human | Should | 2 | Nov 29 | none | W5 |
| P11-05 | Demo runbook and video script draft | C | documentation | human | Should | 2 | Nov 29 | none | W5 |
| P11-06 | Deploy both apps and the landing page | C | devops | security + architect (B consulted) | Must | 1 | Nov 30 | P11-03, human deploy approval | W6 |
| P11-07 | Cross-tenant check against the deployed URLs | C | verification | security + architect | Must | 1 | Nov 30 | P11-06 | W6 |
| P11-08 | Judge guide and Kiro write-up draft | C | documentation | human | Should | 2 | Nov 30 | P11-02, P11-06 | W6 |
| P11-09 | Security checklist final pass | C | security | human (A signs off) | Must | 1 | Dec 1 | P11-04, P11-07 | W6 |
| P11-10 | Demo dry run by a fresh tester | C | documentation | human | Should | 2 | Dec 1 | P11-05, P5-07 rehearsal | W6 |
| P11-11 | Video storyboard and shot list | C | documentation | human | Could | 3 | Dec 1 | P11-10 | W6 |
| P11-12 | Task status sync | C | documentation | human | Could | 3 | Dec 1 | none | W6 |
