# ADR 0002: Kiro integration via ACP behind KiroAdapter (D2)

## Status
Accepted, 2026-11-15, approved by project lead (person A). The decision on the integration path is conditional: the final path is chosen by spike P0-04. The installed Kiro CLI is 2.7.0 and not logged in, so nothing here has been run on this machine.

## Context
The Engine must drive Kiro to plan, build and repair, receive structured progress, and cancel work. ARCHITECTURE.md section 5 records, from kiro.dev docs and local `kiro-cli acp --help`: ACP is JSON-RPC 2.0 over stdio with `initialize`, `session/new`, `session/load`, `session/prompt`, `session/cancel`, `session/set_mode`, `session/set_model`, streams message chunks and tool calls, and supports `--agent` and `--trust-tools`. The docs describe 2.3x/3.x behaviour, newer than the installed 2.7.0.

## Options considered
1. **ACP (`kiro-cli acp`).** Structured event stream, cancellation, session resume. Recommended.
2. **Headless CLI (`kiro-cli chat --no-interactive`).** Needs `KIRO_API_KEY`, one prompt, text output, no event stream. Fallback.
3. **Kiro Crew.** No documented runtime API. Not used at runtime. Remains a development tool.
4. **`kiro-cli serve` (WebSocket KAS server).** Listed in `--help`, not evaluated. Out of scope until documented.

## Decision
The Engine talks to Kiro only through the `KiroAdapter` interface (contract C2, `packages/shared-contracts/src/kiro-adapter.ts`). `AcpAdapter` is implemented first. A headless adapter is allowed as a fallback. Nothing outside `integrations/kiro/src/` and `sandbox/` spawns processes or speaks ACP. Kiro Crew is never a runtime dependency. Tests use a fake ACP server. The Engine uses a minimal tool allow-list (`--trust-tools`), never `--trust-all-tools` outside the sandbox.

## Consequences
- A swap of integration path changes only the adapter, not the Engine.
- Kiro CLI version drift is a risk. The CLI version is pinned in the sandbox image (P4-02).
- If P0-04 shows ACP does not work, this ADR is amended or superseded. If no path works, Lathe ships as "independent verification and delivery for Kiro-built changes" (IMPLEMENTATION_PLAN.md P0).
- Revisit if: ACP message shapes differ from the docs in the pinned version, or licensing prohibits automated use (see ADR 0003).

## Verification
P0-04: handshake `initialize` -> `session/new` -> `session/prompt` (writes a file) -> `session/cancel`, recorded in `docs/spikes/kiro-acp.md`. P0-07: C2 compiles and is frozen. P4-01: adapter works against the fake ACP server and the real CLI.
