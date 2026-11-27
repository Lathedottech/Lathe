# Workstreams and dependency-aware parallel execution

Status: Proposed. Dates are from TASKLIST.md. Owners and reviewers: [task-ownership.md](task-ownership.md).

## Dependency diagram

```mermaid
flowchart TD
  subgraph W0[W0 Setup - serial, Nov 15-17]
    P001[P0-01 repo init - devops]
    P002[P0-02 lean monorepo - devops]
    P006[P0-06 CI + CODEOWNERS - devops]
    P003[P0-03 ADRs D1-D6 - architect]
    P005[P0-05 steering, hooks, specs - architect]
    P008[P0-08 agent team - architect]
    P001 --> P002 --> P006
  end
  H0{{Gate G0: human approves team + ADRs}}
  W0 --> H0

  subgraph W1[W1 Interfaces and feasibility, Nov 16-18]
    P004[P0-04 Kiro go/no-go - kiro-integration]
    P007[P0-07 contracts C1-C4 - architect]
  end
  H0 --> W1
  G1{{Gate G1: contracts frozen + Kiro path chosen}}
  W1 --> G1

  subgraph W2[W2 Parallel tracks, Nov 18-25]
    direction LR
    subgraph TRA[Track A Skeleton]
      P101[P1-01..05 core - backend] --> P106[P1-06 tenant contract final - architect]
      P106 --> P107[P1-07 template - frontend]
    end
    subgraph TRB[Track B Harness]
      P201[P2-01..03 runner and gates - verification] --> P204[P2-04..07 suites - verification]
    end
    subgraph TRC[Track C Kiro runtime]
      P401[P4-01 adapter + fake ACP server] --> P402[P4-02 sandbox]
      P402 --> P403[P4-03 worktree + diff] --> P404[P4-04 agent configs]
    end
    subgraph TRD[Track D Engine core]
      P301[P3-01..03 schema, state machine, evidence - backend] --> P304[P3-04 API + SSE]
    end
  end
  G1 --> W2
  P900[P9-00 design system + wireframes - frontend]
  G1 --> P900
  P900 --> P901
  P900 --> P901L
  P101 -. real skeleton replaces fixture app .-> P204
  P304 -. API contract C4 .-> P901

  G2{{Gate G2: component integration: harness passes template app, fake-agent run walks all states, Kiro returns a diff}}
  W2 --> G2

  subgraph W3[W3 Apps and Workspace shell, Nov 20-26]
    P601[P6-01..03 Support Desk domain - backend]
    P701[P7-01..02 hierarchy + Team Ops - backend]
    P901[P9-02..04 Workspace shell, dashboard, project views - frontend]
  end
  G1 --> P601
  P107 --> P601
  P101 --> P701
  P304 --> P901
  G2 --> W3

  subgraph W4[W4 Integration, Nov 25-29]
    P501[P5-01..04 plan, build, verify, repair - backend]
    P505[P5-05 fault injection - backend]
    P506[P5-06 adversarial tests - verification]
    P801[P8-01 delivery - backend]
    P802[P8-02 CI verify workflow - devops]
    P605[P6-05 Support Desk UI - frontend]
    P704[P7-04 Team Ops UI - frontend]
  end
  G2 --> W4
  P204 --> P501
  P404 --> P501
  P501 --> P506
  P501 --> P505
  P501 --> P801

  G3{{Gate G3: P5-07 rehearsal passes with real Kiro}}
  W4 --> G3
  W3 --> G3

  subgraph W5[W5 Demo and polish, Nov 28-Dec 2]
    P507[P5-07 vertical slice - architect leads, all support]
    P604[P6-04 KB module via Lathe]
    P703[P7-03 shared resources via Lathe]
    P902[P9-05..06 live run, verification, delivery UI - frontend]
    P901L[P9-01 landing page, claims audit - frontend]
    P907[P9-07 responsive + accessibility - frontend]
  end
  G3 --> W5
  F{{Dec 1 Feature freeze}}
  W5 --> F

  subgraph W6[W6 Ship, Nov 30-Dec 3]
    P1001[P10-01 deploy - devops]
    P1002[P10-02 security checklist - security]
    P1003[P10-03 README + Kiro write-up - documentation]
    P1004[P10-04 video script + submission - documentation + human]
  end
  F --> W6
```

## Waves and gates

| Wave | Dates | Parallel tracks (disjoint paths) | Exit gate |
|---|---|---|---|
| W0 | Nov 15–17 | devops scaffold; architect ADRs, steering, agents | G0: human approves agent team and ADRs D1–D6; CI green on empty packages |
| W1 | Nov 16–18 | kiro-integration spike ∥ architect contracts | G1 (Nov 17–18): Kiro path chosen with evidence; contracts C1–C4 frozen |
| W2 | Nov 18–25 | E design system P9-00 ∥ A skeleton (backend, frontend template) ∥ B harness (verification) ∥ C Kiro runtime (kiro-integration) ∥ D Engine core (backend) | G2: harness passes template app and fails every fixture; fake-agent run walks all states; Kiro returns a diff from the sandbox |
| W3 | Nov 20–26 | Support Desk domain ∥ hierarchy + Team Ops ∥ Workspace shell, dashboard, project views (P9-02..04) | Apps pass harness; Workspace shows real Engine data |
| W4 | Nov 25–29 | Pipeline ∥ delivery ∥ adversarial tests ∥ app UIs | G3: P5-07 rehearsal passes with real Kiro |
| W5 | Nov 28–Dec 2 | Demo ∥ Lathe-generated modules ∥ landing page and Workspace polish (P9-01, P9-06, P9-07) ∥ Team C: demo spec, setup guide, deploy artifacts, checklist draft, runbook (P11-01..05, Nov 28–29) | Dec 1 feature freeze |
| W6 | Nov 30–Dec 3 | Deploy ∥ checklist ∥ docs ∥ video ∥ Team C: deploy, deployed cross-tenant check, judge guide, checklist final, dry run, storyboard, status sync (P11-06..12, Nov 30–Dec 1) | Submitted by Dec 3 |

## What is safe to run in parallel

| Parallel pair | Why safe |
|---|---|
| backend (packages/application-foundation) ∥ backend (services/factory-engine) | Different paths. Share only frozen contracts |
| kiro-integration ∥ backend | Adapter contract C2 frozen; backend uses the fake adapter from kiro-integration |
| verification ∥ backend | Verification uses tenant contract C1 and a fixture app until the real skeleton exists |
| frontend (Workspace) ∥ backend (Engine API) | API contract C4 frozen; Workspace calls the real Engine in tests, so the Engine must reach a minimal API first (P3-04) |
| devops ∥ everyone | Owns separate files; dependency additions go through package owners |
| documentation ∥ everyone | Reads reports; writes only docs |
| Team C (P11) ∥ A and B | Team C paths (`specs/**`, `infra/deploy/**`, `tests/e2e/**`, `docs/setup/**`, `docs/security/**`, `docs/demo/**`, `docs/judge-guide.md`) are disjoint from A's and B's. No A or B task depends on C, except P5-07 consuming the demo spec P11-01 (soft: A can write the spec if P11-01 slips) |
| security review ∥ next task of the author | Review verdicts gate the **merge** of a task, not the start of the next independent task |

## What must be serialized

| Serial pair | Reason |
|---|---|
| P0-01 → P0-02 → P0-06 | Repo, then scaffold, then CI |
| P0-07 (contracts) → every consumer | Interfaces first |
| P1-02 tenancy → P1-05 `defineAction` → P1-06 contract final → P2-04/05 suites on real skeleton | Each layer builds on the one below |
| P4-01 adapter → P4-02 sandbox → P4-03 worktree | Sandbox needs the adapter's process model |
| P5-03 verification step → P5-04 repair loop → P5-06 adversarial tests | Each step consumes the previous |
| Any change to a frozen contract | Handoff, architect approval, consumer acknowledgment, then edit |
| Edits to `pnpm-lock.yaml` | Generated. Re-run `pnpm install` after rebase |
| Any task touching `packages/verification-harness/` or `.github/` | Only the owner writes; others hand off |
| P11-06 deploy after human approval of the host (D13) and of the deploy | Agents and C never deploy without A's explicit approval |
| `README.md` edits | C only from Nov 30; before that, handoff to C. Others send handoffs after that |

## Team C sequencing
P11-01, P11-02, P11-04 and P11-05 run in parallel on Nov 28–29. P11-03 starts Nov 29, then P11-06 → P11-07 → P11-09. P11-02 and P11-06 → P11-08. P11-05 → P11-10 → P11-11. P11-12 runs any time. Team C is not on the critical path; the critical path below is unchanged.

```mermaid
flowchart LR
  P1101[P11-01 demo spec] -. soft input .-> P507[P5-07 demo - A]
  P1102[P11-02 setup guide] --> P1108[P11-08 judge guide + Kiro write-up]
  P1103[P11-03 deploy artifacts] --> P1106[P11-06 deploy - after human approval]
  P1106 --> P1107[P11-07 deployed cross-tenant check]
  P1106 --> P1108
  P1104[P11-04 checklist draft] --> P1109[P11-09 checklist final]
  P1107 --> P1109
  P1105[P11-05 runbook + script] --> P1110[P11-10 dry run] --> P1111[P11-11 storyboard]
  P1112[P11-12 status sync]
```

## Critical path

P0-02 → P0-07 → P1-02/05 → P1-06 → P2-04/05 → P5-03 → P5-04 → P5-07 → P10-04. Delay on this path moves the submission. P0-04 (Kiro spike) is an off-path risk that can change the whole plan, so it starts first.
