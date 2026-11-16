# How Kiro is used in Lathe

This is the write-up required by the Kiroween submission. It is a **living document**. Each section separates what has been done from what is planned. Nothing in "Observed result" may be filled in without a link to evidence (commit, report, screenshot, transcript). `documentation` maintains this file.

Last updated: 2026-11-15. Implementation has not started. Only the planning and agent-team setup below exist.

Legend: **Done** (artifact exists in repo) · **Planned** · **Not yet measured**.

## 0. Two uses of Kiro in one project

| Use | Purpose | Kiro surface |
|---|---|---|
| Development-time | Build Lathe, the skeleton and two apps | Kiro IDE, Kiro Crew, Kiro CLI |
| Runtime | Lathe's Engine builds and repairs app modules | `kiro-cli acp` inside a sandbox (spike P0-04 decides the exact path) |

Kiro Crew has no documented embeddable runtime API, so it is a development tool only.

## 1. Kiro IDE, CLI, Web, Crew: how they differ

| Surface | Role in this project | Status | Observed result |
|---|---|---|---|
| IDE | Planning, specs, steering, custom agents, hooks, day-to-day implementation | Done: planning and agent definitions authored in the IDE | Not yet measured |
| CLI | Runtime coding engine for Lathe (ACP and headless); scripted dev sessions | Planned. Installed CLI is 2.7.0; Markdown agents and V3 features need a newer CLI | Not yet measured |
| Crew | Optional dispatcher for the dev-time agents across waves. Never a runtime dependency. Global Crew profiles exist in `~/.kiro/agents/`; whether Crew can run the workspace profiles in `.kiro/agents/` is unverified (task P0-09) | Planned, not yet tried | Not yet measured |
| Web | Not planned | n/a | n/a |

Comparison to be written after use: where each was faster, where each failed. Evidence log: §9.

## 2. Custom agents

**Done:** eight dev-time agents in `.kiro/agents/*.md` (architect, backend, frontend, kiro-integration, security, verification, devops, documentation), written in the IDE-1.0 / CLI-V3 Markdown format.

Design decisions that go beyond role names:
- **Ownership enforced by permissions.** Each profile has `fs_write` allow rules for the paths it owns and `deny` rules for protected paths (`packages/verification-harness/**`, `.github/**`). Kiro applies deny-overrides, so a builder agent cannot edit the verification harness even if its prompt is manipulated.
- **Independent reviewer.** `security-agent` has no write access to source. It reviews, writes a verdict, and can block a merge. This mirrors the product thesis: the builder never certifies its own work.
- **Secrets denied.** `fs_read` deny for `.env*`, keys and certificates on every agent.
- **Steering listed per agent** in `resources`, because custom agents do not inherit steering automatically (per the Steering docs).
- **Two agent families.** Dev-time agents (`.kiro/agents/`) versus runtime agents Lathe launches in sandboxes (`integrations/kiro/agents/`, planned in P4-04). They have different trust levels.

Open verification items: confirm in the IDE that each profile loads, that `resources` resolve, and that the deny rules actually block a write attempt. Result: **Not yet measured**.

## 3. Hooks

**Planned (task P0-05, owner devops):** standalone `.kiro/hooks/*.json` hooks, each tested before use.
- `PostFileSave`: typecheck and test the changed package.
- `PreToolUse` on write tools: warn or block writes under `packages/verification-harness/` and `.github/` outside the owning role.
- `Stop`: remind the agent to produce the 8-part report from `AGENTS.md`.
Status of each hook, and what it caught: **Not yet measured**.

## 4. Spec-driven development

**Planned:** one spec per phase in `.kiro/specs/` (requirements, design, tasks), with requirements written as testable acceptance criteria that map to `TASKLIST.md` task IDs. Lathe's own runtime specs live in `specs/` and are the input format for Lathe runs, so the same discipline applies at both levels.

Comparison with vibe coding: to be written from real experience. Evidence to collect: rework count, defects found by gates, tasks accepted on first review. **Not yet measured.**

## 5. Steering

**Done:** six steering files in `.kiro/steering/` plus a short `AGENTS.md` that routes to them. Inclusion modes used (all from the Steering docs): `always` for `product`, `architecture`, `security`, `agent-workflow` (rules that apply to every task); `fileMatch` for `engineering-standards` (loads only for TypeScript, SQL and config files) and `testing` (loads only for test, fixture and verification files). Custom agents do not receive steering automatically, so each profile lists `file://.kiro/steering/*.md` in `resources`. Strategy: one domain per file, each rule written once, task-specific detail in specs rather than steering.
Which file changed Kiro's behaviour most: **Not yet measured.**

## 6. MCP

**Decided so far:** Lathe runtime sessions use no MCP servers (`mcpServers: []`). For development, no MCP server is configured yet and `.kiro/settings/mcp.json` does not exist. Candidates (read-only Postgres for RLS inspection, GitHub status for evidence) are evaluated in task P0-09 and adopted only if they remove a concrete step. If none is adopted, this section will say so instead of listing one. Credentials, if any, will be `${VAR}` references, never values. Where MCP sits in the repository: `docs/architecture/10-kiro-usage-map.md`. Outcome: **Not yet measured.**
## 7. Property-based testing

**Planned (fast-check):** authorization invariants (no permission without explicit grant, explicit deny wins, no escalation through nesting), tenant isolation (data created in one org is never visible from another), the Engine run state machine (no illegal transition sequence), and SLA calculations (with an injected clock). Seeds are logged so failures reproduce.
Bugs PBT found that unit tests missed: **Not yet measured.** Each one will be recorded with the failing seed.

## 8. Powers

**Planned:** none chosen yet. Installed powers on this machine will be reviewed during P0-05, and any that map to the stack (for example database or GitHub tooling) will be evaluated. If none helps, this section will say so.

## 9. Evidence log

| Date | Kiro feature | What was done | Artifact | Effect |
|---|---|---|---|---|
| 2026-11-15 | Docs research (web fetch) | Verified ACP methods, headless mode, Markdown agent format, hooks and steering schemas | `ARCHITECTURE.md` §5, `.kiro/agents/*.md` | Agent format and permissions design rely on these docs |
| 2026-11-15 | Custom agents (IDE) | Authored eight agent profiles with path-ownership permissions | `.kiro/agents/*.md` | Not yet measured |
| 2026-11-15 | Steering | Authored six steering files with `always` and `fileMatch` inclusion, and a routing AGENTS.md | `.kiro/steering/*`, `AGENTS.md` | Not yet measured |
| 2026-11-15 | Repository structure | Adopted the proposed apps/packages/services/integrations layout; mapped Crew, MCP, hooks, specs, steering and agents to repository locations | `docs/adr/0007-repository-structure.md`, `docs/architecture/10-kiro-usage-map.md` | Not yet measured |
