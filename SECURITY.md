# Security

Status: Proposed. No code exists yet; these are requirements the implementation must meet.

## Trust boundaries

1. Operator ↔ Workspace/Engine (authenticated, RBAC, TLS).
2. Engine ↔ agent sandbox (untrusted side: agent, its output, its dependencies).
3. Engine ↔ verifier sandbox (runs untrusted generated code, trusted harness).
4. Engine ↔ GitHub / Kiro service (third parties).
5. Generated app tenants ↔ each other.

## Threats and controls

| Threat | Control |
|---|---|
| Agent edits harness/policies/CI to pass itself | Protected paths not mounted writable; Engine path-deny on final diff; CODEOWNERS; CI workflow taken from base branch; verifier uses trusted checkout |
| Agent weakens or deletes tests | Lathe-owned conformance suites; test-count and coverage floors; diff review flags test deletions |
| Prompt injection via specs, repo files, dependencies | Treat all as data; sandbox with no creds; minimal tool allow-list; human approval for spec and PR |
| Credential exfiltration | No prod credentials, GitHub tokens, or Engine DB URL in sandbox; Kiro key scoped to Kiro process; egress allow-list; secret scan on diff and logs |
| Sandbox escape | Non-root, `no-new-privileges`, dropped capabilities, read-only root FS, no Docker socket, resource limits, ephemeral; evaluate gVisor in P10 |
| Malicious dependencies | Lockfile required, pinned versions, audit gate, new-dependency flag in PR |
| Cross-tenant data access | RLS with FORCE, non-owner role, `SET LOCAL` per transaction, org from membership not input, isolation suite |
| Privilege escalation | Deny-by-default `can()`, permission declaration required on every handler, escalation tests |
| Tampered evidence | Append-only store, content hashes, hash chain per run |
| Unapproved merge/deploy | Engine has no merge permission; branch protection; human approval recorded |
| Webhook spoofing | Verify GitHub signature; replay protection |
| Runaway cost/loops | Budgets per run, max repair attempts, timeouts, `session/cancel` |

## Rules

- Secrets only in env or a secrets manager. Never in repo, prompts, logs, or evidence.
- Logs are structured and redacted.
- GitHub App with minimum scopes; no personal tokens.
- High-impact actions (spec approval, plan approval, merge, deploy, credential changes) need a human.
- Do not use `--trust-all-tools` outside a sandbox that holds nothing worth stealing.

## Accepted risks for the Kiroween MVP

| Risk | Why accepted | Removed by |
|---|---|---|
| Fine-grained GitHub token instead of GitHub App | Setup time | Post-hackathon GitHub App |
| Docker isolation (no gVisor) | Time; mitigated by hardening and no credentials in sandbox | Backlog sandbox ADR |
| No SAST | Secret scan and dependency audit cover the highest risks | Backlog |
| If P0-04 lands on path D, Kiro runs on the host in a disposable worktree | Only if container paths fail; documented in the spike | Container path once supported |
| Demo fault injection exists in Engine code | Needed for a deterministic demo; opt-in, refused for non-demo runs, always labeled | Can be compiled out post-hackathon |

## Reporting

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/ousssamarahmani/Lathe/security/advisories/new). Do not report vulnerabilities in public issues, pull requests or discussions.
