# ADR 0007: Repository structure (D20)

## Status
Accepted, 2026-11-15, proposed by the project lead (person A) and approved by the same. Supersedes the `skeleton/`, `lathe/` and top-level `verification/` layout in ARCHITECTURE.md §9 as first written. Task: structure change after P0-02.

## Context
The first layout put the Engine, Kiro adapter, sandbox, GitHub delivery and contracts in one package (`lathe/engine`), the foundation in `skeleton/core` and the harness in `verification/`. Two problems showed up while writing the agent profiles:
- `kiro-integration` and `backend` both needed to edit `lathe/engine/package.json`, which forced handoffs for ordinary dependency changes.
- `verification/` had to import contract types from the Engine package, which weakens the rule that the harness is independent of Engine code.

The hackathon requires `/.kiro` at the repository root and the two apps in separate folders.

## Options considered
1. Keep one Engine package with folders. Fewer packages, but shared `package.json` and an awkward harness import.
2. **Split by owner with interfaces in a contracts package (chosen).** `apps/`, `packages/`, `services/`, `integrations/`.
3. One repository per component. Rejected: breaks the requirement that one public repository contain everything, and adds coordination cost for two people.

## Decision
Adopt this layout:

```
.kiro/  apps/{workspace,support-desk,team-operations}
packages/{application-foundation,shared-contracts,verification-harness}
services/factory-engine  integrations/{kiro,github}
templates/app-starter  specs/  infra/  scripts/  docs/  tests/  .github/
```

Rules:
- `packages/shared-contracts` holds types and Zod schemas only: C1 tenant contract, C2 Kiro adapter and sandbox interfaces, C3 gate schema, C4 Engine API. One owner (`architect`).
- `packages/verification-harness` is **protected** and may import only `shared-contracts`. The Engine runs it as a process (`lathe-verify`). It lives under `packages/`, so the no-import rule must be enforced by tooling, not by convention (task to add; currently no owner, see Consequences).
- `services/factory-engine` depends on interfaces. `integrations/kiro` and `integrations/github` implement them and are wired in the Engine's composition root only.
- `integrations/kiro` owns the ACP adapter, a fake ACP server, the sandbox runner, the runtime agent configs and the sandbox image.
- Kiro Crew has no place in the runtime tree. MCP servers are not used at runtime. See `docs/architecture/10-kiro-usage-map.md`.

## Differences from the proposal as received
| Proposal | Adopted | Reason |
|---|---|---|
| 7 agent files | 8: `documentation-agent.md` added | Team design already includes the documentation role |
| No place for sandbox, runtime agent configs, specs, template | Sandbox, fake server, runtime agents and image in `integrations/kiro`; product specs in `specs/`; starter in `templates/app-starter` | Each has a single owner; the Skeleton Crew entry must show a skeleton (`application-foundation` plus the starter) |
| `shared-contracts` | Also holds the tenant contract (was inside the foundation) | Lets the harness depend on contracts only |
| Not listed | `infra/`, `scripts/`, `.github/`, `LICENSE`, `.kiro/specs`, `.kiro/settings/mcp.json` | Needed by tasks P0-05, P0-06, deployment and MCP decision |

## Consequences
- The two scaffolded packages moved: `skeleton/core` to `packages/application-foundation` and `verification` to `packages/verification-harness`. Package names are now `@lathe/application-foundation` and `@lathe/verification-harness`. Re-verified on 2026-11-15: install, typecheck, lint, test and format check pass.
- Reports written before this change (`docs/reports/P0-02-devops.md`, `docs/reports/P0-03-architect.md`) and `docs/backlog/` keep the old paths on purpose; they record what was true at the time.
- Agent profiles, steering, ownership table, task list and plan were updated to the new paths. CODEOWNERS (P0-06) must use the new paths.
- **Gap:** no task yet enforces the dependency table in `.kiro/steering/architecture.md` (import boundaries, no cycles). It needs an owner (`devops` with `architect`) before the first cross-package import is written.
- Revisit if two people find the number of packages slows them down. Merging `integrations/*` back into the Engine is a mechanical change.

## Verification
Layout matches the tree above (`Get-ChildItem`). Agent write rules and the path-ownership table in `docs/agents/team.md` §3 agree. Dependency rules in `.kiro/steering/architecture.md` are enforceable once the gap above is closed.
