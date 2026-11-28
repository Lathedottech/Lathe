# P5-04 Repair loop: backend report

## 1. Objective completed
P5-04 completed (code and tests). Review by `architect`/`security` not yet done.

## 2. Files created or modified
- `services/factory-engine/src/pipeline/repair.ts` (new): `runRepairStep`, `runRepairLoop`, `latestFailingGates`, `failureFingerprint`, `buildRepairPrompt`.
- `services/factory-engine/src/pipeline/repair.test.ts` (new): 10 tests.
- `services/factory-engine/src/pipeline/index.ts`: export lines only. `src/index.ts` already re-exports the pipeline index. `build.ts` and `verify.ts` are untouched.

## 3. Technical decisions
- Attempt accounting follows the existing state machine: VERIFYING→REPAIRING consumes an attempt, so repairs run at attempts 1, 2, 3 (exactly 3). The step accepts `1..MAX_REPAIR_ATTEMPTS`. Rejected: allowing only `< 3`, which would give 2 repairs.
- Agent input is built only from the `verify_gate` entries of the latest verification (those before the last `verify_result`), failed/error gates only, capped (10 gates, 20 findings, 500 chars each), redacted again, plus the current patch (100k chars cap), in an untrusted-data fence. Rejected: passing the whole evidence log.
- Fingerprint = SHA-256 of canonical JSON of sorted failing gate ids and the first 3 normalized finding lines per gate (lowercase, numbers, hex and UUIDs masked). The previous fingerprint is read from the last `repair_attempt` evidence entry, so no extra state.
- Reuses `BuildSandboxProvider`, `buildAgentSandboxSpec` and `checkPatchPaths` from P5-02 (task key `repair-<n>`, prior patch = current patch). Rejected: a second provider type.
- Escalation = run FAILED with reason `repair_escalated` plus `repair_escalated` evidence holding both fingerprints. It never moves to AWAITING_APPROVAL.
- The `runRepairLoop` driver is small: verify, then repair, then verify. Only `runVerifyStep` can reach AWAITING_APPROVAL.

## 4. Tests executed
- `pnpm exec vitest run src/pipeline/repair.test.ts` (in `services/factory-engine`)
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm exec prettier --check services docs` (root)

## 5. Test results
- Repair tests: 10 passed. Root: 50 files, 687 passed, 5 skipped (pre-existing), 0 failed. Typecheck, lint (0 warnings after cleanup), prettier: exit 0.
- Covered: fix on attempt 1 → re-verify → AWAITING_APPROVAL; never fixes → exactly 3 repairs, `repair_exhausted`; same failure twice → escalated after 2 verifications with both fingerprints; agent input has no harness text, passing-gate output or other evidence, and the second prompt has only the latest failure; new sandbox per attempt, all destroyed; protected-path repair patch → FAILED and not stored; agent error → FAILED and sandbox destroyed; fast-check (60 runs): at most 3 repairs and 4 verifications, AWAITING_APPROVAL only when the last recorded verification passed.

## 6. Remaining issues
- When attempts are exhausted, `runVerifyStep` (P5-03, not edited) moves the run to FAILED with transition reason `verification_failed`. The `repair_exhausted` reason exists as evidence kind written by `runRepairLoop`, not as the run event reason. A tiny hook in verify.ts would fix this.
- The loop driver is not wired to the composition root or API (later task).
- The failure fingerprint uses only the first 3 findings per gate, so different failures with identical leading lines are treated as the same.
- Real Kiro repair behavior not exercised (fake adapter only).

## 7. Dependencies or blockers
Stacked on P5-03 (688a8ec, PR #44).

## 8. Recommended next task
Wire loop into the pipeline driver and API; then P5-07 demo. Request `security` review of the repair input boundary.
