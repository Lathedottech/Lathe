# P2-07 Security gate (verification)

## 1. Objective completed
P2-07: gate 7 `security` (secret scan of the agent patch, dependency audit). Completed, pending review.

## 2. Files created or modified
- `packages/verification-harness/src/gates/security.ts` (new)
- `packages/verification-harness/src/gates/security.test.ts` (new)
- `packages/verification-harness/src/registry.ts` (registers `securityGate()`)
- `docs/reports/P2-07-verification.md`

## 3. Technical decisions
- gitleaks runs as a process: `detect --no-git --source <patch file> --redact --exit-code 2`. Exit code 2 means leaks, so gitleaks' generic exit 1 (including "command not found" through the Windows shell) is `error`. Rejected: default exit code 1, which cannot be told apart from a crash.
- Reports are read for `RuleID` and `StartLine` only. Line numbers are mapped back to file and new-file line through the diff hunks. Secret values are never read or stored. Rejected: scanning the worktree, which would flag pre-existing content that is not in the agent patch.
- Binary: `LATHE_GITLEAKS`, else `gitleaks` on PATH.
- Audit: `pnpm audit --audit-level high --json` in `apps/<app>`. Severity is counted by the gate from advisories and metadata, not from pnpm's exit code. Registry or network error, timeout, or unparseable output is `error`, even with exit 0.
- Both steps always run. Any `error` makes the gate `error` (findings kept), else any finding makes it `failed`.
- No new dependencies. No policy file: the level (`high`) and timeouts are constants in the gate.

## 4. Tests executed
- `pnpm exec vitest run src/gates/security.test.ts` (cwd `packages/verification-harness`, `LATHE_GITLEAKS=%TEMP%\lathe-launch\tools\gitleaks.exe`)
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm exec prettier --check packages`

## 5. Test results
- security.test.ts with real gitleaks: 17 passed, 0 failed (15 mocked, 2 real: planted token caught with file and line and no value, clean diff passes). Exit 0.
- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0 (run before the prettier fix, which changed formatting only).
- `pnpm test`: 28 files, 397 passed, 0 failed, exit 0. The real-gitleaks tests are skipped here because `LATHE_GITLEAKS` was unset.
- `prettier --check packages`: first run failed on the two new files, `--write` applied, re-run exit 0.

## 6. Remaining issues
- `pnpm audit` runs in the app directory and uses the workspace root lockfile, so it audits all workspace dependencies, not only the app's.
- A gitleaks path containing spaces would break on Windows because the runner uses `shell: true` for the command itself.
- Real `pnpm audit` was not run (needs network); only mocked JSON is tested. The shape follows pnpm's npm-compatible JSON and should be confirmed once online.
- gitleaks scans diff text with `+` prefixes. Rules that anchor on line start may miss; only `ghp_` was exercised against the real binary.

## 7. Dependencies or blockers
None. The `properties` gate is not registered in this branch (P2-06 is on its own branch).

## 8. Recommended next task
P2-08 (fixtures self-test) including a secret-in-diff and a high-vulnerability fixture.
