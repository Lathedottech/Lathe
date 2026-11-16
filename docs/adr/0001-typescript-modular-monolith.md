# ADR 0001: TypeScript modular monolith, pnpm workspaces, Node 22 (D1)

## Status
Accepted, 2026-11-15, approved by project lead (person A). Task P0-03.

## Context
Lathe needs one deployable control plane (Engine API and worker, Workspace) and two apps built from a shared skeleton, by two people in about 18 days. Only sandbox containers need a separate runtime, because isolation is a security requirement. The Engine, Workspace, skeleton and harness share contract types (C1-C4).

## Options considered
1. **TypeScript modular monolith in a pnpm workspace, Node 22.** One language, shared Zod schemas and types across packages.
2. Microservices with a message broker. Rejected: listed as a non-goal in `product.md`; adds operations cost with no MVP benefit.
3. Turborepo on top of pnpm. Rejected for the MVP: listed out of scope in the P0 plan. Revisit if build times hurt.
4. Node 24 (the version installed locally). Rejected as the target: ARCHITECTURE.md proposes Node 22 LTS, pinned in `.nvmrc` and CI.

## Decision
TypeScript (strict, `noUncheckedIndexedAccess`) in a pnpm workspace on Node 22, no Turborepo. Engine modules are folders in one package (`services/factory-engine`), not separate packages. Packages are created only when their task starts. Module boundaries follow `.kiro/steering/architecture.md`.

## Consequences
- One language and shared types reduce contract drift between tracks.
- Module boundaries are enforced by convention and review, not by process boundaries. A lint or dependency check for the import rules is needed (not yet planned as a task; to be raised with devops).
- Local Node is v24.14.0, so developers must use Node 22 via `.nvmrc` to match CI.
- Revisit if: build or test time blocks the team, or a component needs a different runtime.

## Verification
P0-02: `pnpm i && pnpm typecheck && pnpm test` pass on a clean clone with Node 22. P0-06: CI runs the same commands on pull requests.
