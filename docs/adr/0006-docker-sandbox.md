# ADR 0006: Docker sandbox on Linux/WSL2, gVisor later (D6)

## Status
Accepted, 2026-11-15, approved by project lead (person A). Task P0-03. Environment note: at the time of writing Docker Desktop and WSL Ubuntu are stopped on the development machine, so no sandbox check has been run.

## Context
Runtime agents are untrusted: they read specs and repo files that may carry prompt injection, and they run code. They must not reach credentials, the host, `packages/verification-harness/` or `.github/`. SECURITY.md lists sandbox escape and credential exfiltration as top risks.

## Options considered
1. **Hardened Docker container on Linux/WSL2.** Available now.
2. gVisor or another stronger runtime. Deferred: SECURITY.md says to evaluate in P10 and records Docker without gVisor as an accepted risk (time).
3. Run Kiro on the host. Weaker isolation. Only as path D of ADR 0003, documented.

## Decision
Agent and verifier run in Docker containers: non-root, `--cap-drop ALL`, `no-new-privileges`, read-only root with tmpfs, CPU, memory and pids limits, no Docker socket, never `--privileged`. Egress goes through an allow-list proxy for the agent sandbox. The verifier has an ephemeral database and no egress. Mounts: target app (rw) and `packages/application-foundation` (ro). `packages/verification-harness/` and `.github/` are absent. Only the Kiro credential enters the sandbox. The agent container is destroyed before verification. The Engine also rejects diffs that touch protected paths, independent of the sandbox.

## Consequences
- Docker shares the host kernel, so a kernel-level escape is an accepted MVP risk.
- The Engine host must run Docker on Linux or WSL2, so the Engine is not publicly hosted (D14, product non-goal).
- The egress allow-list depends on the endpoints found in P0-04.
- Revisit if: a sandbox check fails, an escape is found, or time allows gVisor.

## Verification
P4-02: scripted checks (no host env, blocked hosts unreachable, no Docker socket) run in CI on a Linux runner. P4-03: protected paths absent from the mount. P2-02 and P5-06: protected-path and self-certification attacks fail. P5-03: agent container gone before verify.
