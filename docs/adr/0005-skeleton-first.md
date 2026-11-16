# ADR 0005: Skeleton core written first, then maintained through Lathe (D5)

## Status
Accepted, 2026-11-15, approved by project lead (person A). Task P0-03.

## Context
Lathe builds bounded modules inside apps using `packages/application-foundation` (auth wiring, orgs, memberships, RBAC, tenancy, audit, tenant contract). The harness learns about an app only through the tenant contract exported from the skeleton. Without the skeleton and contract, there is nothing for Lathe to build on or verify against.

## Options considered
1. **Dev team writes the skeleton first (Kiro IDE and Crew), Lathe maintains it afterwards.**
2. Lathe generates its own foundation. Rejected: Lathe cannot build on a foundation that does not exist yet, and its gates depend on the skeleton contract.
3. Generate whole apps from scratch with Lathe. Rejected: listed as a non-goal in `product.md`. Lathe builds bounded modules (D11).

## Decision
Skeleton P1 is written by the dev team before the pipeline needs it. Lathe runs build and repair modules inside the apps (Support Desk Knowledge Base is the demo module). During app-module runs `packages/application-foundation` is mounted read-only in the sandbox and is a protected input. Apps import its public `index.ts` and never copy its code.

## Consequences
- The skeleton is on the critical path for the harness (P2-04 needs P1-06) and the demo.
- The foundation is not produced by Lathe, so the demo does not show Lathe building it. Claims must say Lathe builds bounded modules.
- Revisit if: after the hackathon, skeleton changes should themselves go through Lathe runs (backlog).

## Verification
P1-06: the template app contract validates. P1-07: a generated app passes the harness. P2-04 and P2-05 run against the contract. A gate fails if skeleton code is copied into an app.
