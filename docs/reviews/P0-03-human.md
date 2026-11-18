# Approval: P0-03 ADRs D1 to D6

- **Approver:** Oussama Rahamni (person A, project lead)
- **Date:** 2026-11-17
- **Verdict:** **Approved**
- **Approved content** (sha256 of the sorted list of git blob ids below): `2b0d640d4a280508b1f268e2984fe5ac384a744c1851253a9aee4bc9c3133374`

    5eebe62c3928ceed029ccfbbf23ba0129f6c19e7  docs/adr/0001-typescript-modular-monolith.md
    4fe2810ab10a5c619eed784d84bcbb7fb262a87c  docs/adr/0002-kiro-integration-via-acp.md
    10c1bbb1fbfa2a188cac62061f11c9534fb2a96d  docs/adr/0003-kiro-authentication-for-automation.md
    cdf3ffa3ff9a2aa2b34d717ef428213b50a5c46f  docs/adr/0004-postgres-rls-deny-by-default.md
    0969cdd6511a2cb3d370fb23c7b83dcc65f641c5  docs/adr/0005-skeleton-first.md
    4de92332bd4d97b453bafbb1038aa8fd9815ffe1  docs/adr/0006-docker-sandbox.md
    26877bbb8c1cacc4efcbb11d87e7afed08e17f36  docs/adr/README.md

## Scope of this approval

- ADRs 0001, 0002, 0004, 0005, 0006 are approved as Accepted.
- ADR 0003 (Kiro authentication for automation) stays **Proposed**. It is decided by spike P0-04; this approval does not pick a path.
- Any change to the files above after this date invalidates this approval for the changed file. A new approval is required.

## Still open

- ADRs 0004 (Postgres RLS) and 0006 (Docker sandbox) are security-relevant. The `security` agent review is still required before they are treated as final for implementation of P1-02 and P4-02.
