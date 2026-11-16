# Architecture decision records

Owner: architect. A human (project lead, person A) approves every ADR. Agents never mark a decision approved.
Rationale source: `ARCHITECTURE.md` section 13. Decisions D7 to D19 are not yet written as ADRs, except D20 (structure) in ADR 0007.

| ADR | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-typescript-modular-monolith.md) | D1 TypeScript modular monolith, pnpm workspaces, Node 22 | Accepted | 2026-11-15 |
| [0002](0002-kiro-integration-via-acp.md) | D2 Kiro integration via ACP behind `KiroAdapter` | Accepted, final path pending P0-04 | 2026-11-15 |
| [0003](0003-kiro-authentication-for-automation.md) | D3 Kiro authentication for automation | Proposed, blocked on P0-04 | 2026-11-15 |
| [0004](0004-postgres-rls-deny-by-default.md) | D4 PostgreSQL with RLS and app-layer deny-by-default | Accepted | 2026-11-15 |
| [0005](0005-skeleton-first.md) | D5 Skeleton core written first, then maintained through Lathe | Accepted | 2026-11-15 |
| [0006](0006-docker-sandbox.md) | D6 Docker sandbox on Linux/WSL2 | Accepted | 2026-11-15 |
| [0007](0007-repository-structure.md) | D20 Repository structure (apps, packages, services, integrations) | Accepted | 2026-11-15 |

Each ADR has: Status, Context, Options considered, Decision, Consequences, Verification.
Statuses: Proposed, Accepted, Superseded. A changed decision gets a new ADR that supersedes the old one.
