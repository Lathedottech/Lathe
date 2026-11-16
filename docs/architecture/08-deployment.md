# 8. Deployment architecture (Proposed)

Kiroween MVP: the control plane runs on a trusted operator machine (Windows host, sandboxes in WSL2 Docker). It is not publicly hosted. Only the two generated apps, and optionally a read-only replay Workspace, are public.

```mermaid
flowchart TB
  subgraph Host[Lathe host - single VM/cluster node initially]
    WS[workspace container]
    ENG[engine container]
    PG[(Postgres - engine)]
    DOCK[Docker daemon<br/>or rootless runner]
    ENG --> DOCK
  end
  DOCK --> AG[agent sandbox<br/>no prod creds, egress allow-list]
  DOCK --> VF[verifier sandbox<br/>ephemeral DB, no egress]
  AG -.egress.-> KIRO[(Kiro service)]
  ENG -.-> GH[(GitHub)]
  SEC[(Secrets manager)] --> ENG
  User([Operator]) -->|TLS + SSO| WS

  subgraph Gen[Generated apps - deployed by humans via separate pipeline]
    APP1[Support Desk]
    APP2[Team Operations]
    PG2[(App Postgres, RLS)]
  end
  GH -->|approved release| Gen
```

Agent sandboxes never receive production credentials, GitHub write tokens, or the Engine DB URL. The Engine holds them.
