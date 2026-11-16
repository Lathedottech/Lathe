# 5. Verification and repair loop (Proposed)

```mermaid
flowchart TD
  S[Agent sandbox destroyed] --> C[Apply diff to clean tree<br/>in verifier container]
  C --> PT{Protected-path check}
  PT -- violation --> F[FAILED + security finding]
  PT -- ok --> G1[typecheck / lint / build]
  G1 --> G2[unit + integration]
  G2 --> G3[Lathe-owned conformance:<br/>RBAC matrix, tenant isolation,<br/>deny-by-default, authz]
  G3 --> G4[property-based]
  G4 --> G5[security: audit, secrets, SAST]
  G5 --> R{All passed?}
  R -- yes --> SIG[Engine records signed result<br/>commit SHA + harness hash + policy hash]
  SIG --> AP[/Awaiting human approval/]
  R -- no --> N{Attempts < max?}
  N -- no --> F
  N -- yes --> RP[repair-agent receives<br/>failing output only]
  RP --> NS[New sandbox, fresh session]
  NS --> S
```

Rules: the repair agent never sees or edits harness or policies. Max attempts and token/time budget come from `policies/`. Same failure repeating twice escalates to a human.
