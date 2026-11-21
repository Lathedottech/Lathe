# Report: P0-04 Kiro go/no-go spike (kiro-integration)

## 1. Objective completed
P0-04, **completed: go with mode B** (ACP in a hardened container, Kiro login session in a dedicated volume). Modes A and C need an API key, which the Kiro Free plan does not provide.

## 2. Files
`scripts/spikes/acp-handshake.mjs`, `scripts/spikes/kiro-sandbox/Dockerfile`, `scripts/spikes/kiro-sandbox/docker-run-args.json`, `docs/spikes/kiro-acp.md`, `docs/adr/0003-kiro-authentication-for-automation.md` (rewritten).

## 3. Decisions
Mode B over D (host) because the host has the user's files and credentials. Spike client has no dependencies, so it adds nothing to the lockfile. Details and the rejected API-key path: ADR 0003.

## 4. Tests executed
Container probe (`id`, capabilities, read-only root, Docker socket); `kiro-cli login --license free --use-device-flow` and `kiro-cli whoami` in containers; `node scripts/spikes/acp-handshake.mjs ... -- docker run <hardening flags> ... lathe-spike/kiro:p0-04 acp`.

## 5. Results (2026-11-19)
Login exit 0, `whoami`: `Logged in with Builder ID`. Handshake exit 0: `initialize` ok (7.1 s), `session/new` ok, `session/prompt` `end_turn` with `SPIKE_OK.txt` = `lathe spike ok`, `session/cancel` `cancelled`. Before login, `session/new` failed with `Authentication required`, so the test can fail.

## 6. Remaining issues
Spike used the default Docker network (no egress allow-list) and a personal Builder ID. Permission requests were auto-approved by the spike client. See the findings list in the spike doc.

## 7. Blockers
Lead approval of ADR 0003. Contract C2 v1.2 (session mount, permission requests) before P4-01.

## 8. Next task
P4-02 hardened sandbox with egress allow-list, then P4-01 adapter.
