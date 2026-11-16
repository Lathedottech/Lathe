# ADR 0003: Kiro authentication for automation (D3)

## Status
**Proposed, blocked on P0-04.** No path is chosen. This ADR becomes Accepted only after the spike reports evidence and the project lead approves. The installed CLI (2.7.0) is not logged in (`kiro-cli whoami`).

## Context
Lathe runs Kiro without a human at the keyboard, inside a sandbox that must not hold other credentials (`security.md`: sandboxes receive only the Kiro credential). Whether automated use is allowed, and under which licence and rate limits, is unconfirmed.

## Options considered
Paths in the order they are tried (IMPLEMENTATION_PLAN.md P0 go/no-go, Nov 17). Stop at the first that works.
- **A. ACP in the container with an API key.** Preferred if it works: best isolation and structured events.
- **B. ACP in the container with a mounted Kiro login.** Puts a login session inside the sandbox.
- **C. Headless `chat --no-interactive` in the container with an API key.** No event stream.
- **D. Kiro on the host in a disposable worktree.** Weaker isolation, documented as such.
- **None works:** Lathe ships as independent verification and delivery for Kiro-built changes.

## Decision criteria
1. Works unattended inside a Docker container on WSL2 (P0 acceptance).
2. Credential exposure: only the Kiro credential reaches the sandbox, scoped to the Kiro process; never the GitHub token, production credentials or Engine DB URL.
3. Terms of use and rate limits permit automated use (to be confirmed).
4. Event stream available for evidence and the Workspace activity view.
5. Network endpoints Kiro needs are known, so the egress allow-list (ADR 0006) can be written.
6. Re-runs from a clean clone.
7. Isolation level, and whether the weakness is documented if path D is chosen.

## Decision
Not made.

## Consequences
- P4-01 and P4-02 depend on this outcome. The credential injection method and egress allow-list cannot be finalized before it.
- A fallback to C or D weakens either the event stream or isolation. The write-up must say so.

## Verification
P0-04 records auth method, event shapes, required endpoints and the go/no-go in `docs/spikes/kiro-acp.md`. Gate G1 (Nov 18) requires the path to be chosen.
