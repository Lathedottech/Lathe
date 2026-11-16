# 9. Mini Software Factory: product architecture overview (Proposed)

Redrawn from the project owner's reference image "Lathe: Mini Software Factory Architecture". The image file itself is not in the repository yet. Save it as `docs/architecture/reference/lathe-architecture-overview.png` and link it here. Solid boxes are in the MVP. Dashed boxes are development-time only or post-MVP.

```mermaid
flowchart TB
  subgraph USERS[Users]
    DEV[Developer<br/>build and run]
    REV[Reviewer<br/>approve and verify]
    ADM[Admin<br/>configure factory]
  end

  subgraph WS[Lathe Workspace]
    direction LR
    PRJ[Projects] --- SPC[Specs] --- RUN[Runs] --- GAT[Gates] --- ART[Artifacts]
  end

  subgraph ENG[Factory Engine - orchestrates agentic development]
    direction LR
    PLAN[Plan] --> BUILD[Build] --> TEST[Test] --> VERIFY[Verify] --> SHIP[Ship = DELIVER]
    ORC[Orchestrator<br/>tasks, agents, execution flow]
    HAR[Harnesses<br/>build, test, security, isolation]
    GATES[Verification gates<br/>RBAC, tenant isolation,<br/>property tests, policy]
  end

  subgraph KIRO[Kiro CLI - runtime coding engine]
    KAG[Agents: planner, builder, repair]
    KST[Steering and agent configs<br/>inside the sandbox]
  end

  subgraph GH[GitHub - delivery]
    BR[Branch and commits]
    PR[Draft Pull Request]
    CI[CI checks: same gates]
    MG[Merge: human only]
  end

  subgraph CREW[Kiro Crew - development time only]
    CA[architect, backend, frontend,<br/>kiro-integration, security,<br/>verification, devops, documentation]
  end

  subgraph OUT[Generated outputs]
    FND[Application foundation<br/>auth, orgs, RBAC, tenant isolation, audit]
    SD[Support Desk<br/>tickets, SLA, approvals, roles]
    TO[Team Operations<br/>projects, teams, shared resources, hierarchy]
    FND --> SD
    FND --> TO
  end

  USERS --> WS
  WS --> ENG
  ENG <--> KIRO
  ENG --> GH
  ENG --> OUT
  CREW -. builds the Lathe platform itself .-> ENG
  PR --> REV
  REV --> MG

  classDef later stroke-dasharray: 5 5;
  class CREW later;
```

End-to-end flow (as product copy): **Define** specs and rules → **Plan** → **Build** with Kiro agents → **Test** → **Verify** security and isolation → **Ship** a draft PR for review.

## Differences from the reference image (decided, not accidental)

| Reference image | This architecture | Reason |
|---|---|---|
| "Merge / Release" under GitHub | Merge is a human action on GitHub. The Engine has no merge, approve or deploy call. No release step in the MVP | Human approval and no agent-driven deploy (`security.md`) |
| Kiro box lists Specs, Steering, Agents, Hooks, MCP | Runtime uses agents and steering inside the sandbox. Hooks and MCP are used by the dev-time team, not by Lathe at runtime. No MCP is planned for the runtime | Smallest runtime surface; MCP only if it earns its place (`docs/kiro-usage.md` §6) |
| Kiro Crew shows four agents | Eight dev-time agents (`.kiro/agents/`) | See `docs/agents/team.md` |
| Workspace tabs: Projects, Specs, Runs, Gates, Artifacts | Navigation per P9-02: Overview, Projects, Specifications, Factory Runs, Agents, Verification, Deliveries, Settings. "Gates" maps to Verification, "Artifacts" to evidence and diffs inside runs and deliveries | Matches the approved P9 task list; every page must show real Engine data |
| "Ship" as the last step | UI label for the DELIVER state. Ship means draft PR with evidence plus human approval | Keeps the product from claiming deployment |
| Step list Plan, Build, Test, Verify, Ship (image flow starts at Define) | Canonical states: DEFINE, PLAN, BUILD, TEST, VERIFY, DELIVER | Same sequence; the UI shows Ship for DELIVER |
