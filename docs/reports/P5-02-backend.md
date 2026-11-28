# P5-02 Build step (backend)

## 1. Objective completed

P5-02 completed: `runBuildStep` builds a plan task by task in fresh sandboxes, checks each patch for protected paths inside the Engine, and moves the run to VERIFYING or FAILED. Branch `task/P5-02-build-step`, stacked on P5-01 (b4c707b).

## 2. Files created or modified

- `services/factory-engine/src/pipeline/build.ts` (new)
- `services/factory-engine/src/pipeline/build.test.ts` (new)
- `services/factory-engine/src/pipeline/index.ts` (exports)
- `docs/reports/P5-02-backend.md`

## 3. Technical decisions

- **Gate on approval.** The step reads the stored plan (`PlanSource`) and calls `approvals.check(plan:<runId>, plan)`. A missing or stale approval returns `{ outcome: 'refused' }` with a `build_refused` evidence entry. No sandbox is created and the run stays PLANNED. Rejected: throwing, because refusal is an expected outcome.
- **Sandbox spec built by the step** (`buildAgentSandboxSpec`, validated with the C2 `SandboxSpec`): target app rw, foundation ro, kiro-session, no harness, no `.github`, no secret env. The provider receives `(spec, {targetApp, baseCommit, runId, taskKey, priorPatch})`.
- **Cumulative patches.** Each task gets a fresh sandbox from `baseCommit`. The provider applies the previous cumulative patch (`priorPatch`), so each collected patch is cumulative and the last one is the combined patch. The step rejects a patch whose file list drops files of the previous one (`build_patch_invalid`). Rejected: concatenating independent patches, because later tasks could not build on earlier ones and the pieces could conflict.
- **Engine path check** (`checkPatchPaths`), independent of the sandbox. It reads paths from `diff --git` headers (both sides), `rename/copy from/to` and `---/+++` lines, and adds `patch.files`. It fails closed on anything it cannot parse: text before the first header, text after a hunk whose line counts are used up, unknown header lines, unreadable quoted names, paths containing spaces (ambiguous in git headers), `..`, `.`, empty segments, backslash, colon, NUL. It also rejects symlink (120000) and submodule (160000) modes. Protected: `packages/verification-harness`, `.github`, `.kiro`, `packages/shared-contracts` (case-insensitive), and any segment `.git`, `.gitattributes`, `.gitmodules` (trailing dots and spaces stripped, `git~N`). Allowed: inside the spec `targetPaths` only (stricter than `apps/<app>/`).
- **Failure handling.** Protected-path rejection writes `build_rejected` (redacted paths, rule, count) and moves the run to FAILED with reason `protected_path`. Timeout and agent errors move it to FAILED (`build_timeout`, `build_agent_error`). Bounded repair arrives with P5-04; until then FAILED is the outcome.
- **Sandbox always destroyed** in `finally` (also on create/start/collect errors and timeouts). Timeouts call `cancel` and do not wait for the hanging turn.
- **Hash check.** The Engine recomputes SHA-256 of the diff and compares it to `patch.sha256` and `baseCommit`. The final patch goes to `PatchStore`; evidence holds hash, base commit and file list, not the diff.
- **No pass recorded.** The step only reaches VERIFYING. Verification is P5-03.
- **Fault injection point:** optional `BuildFaultInjector.afterTask`, called before the path check. Not implemented (P5-05).

## 4. Tests executed

- `pnpm exec vitest run services/factory-engine/src/pipeline`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm exec prettier --check services docs`

## 5. Test results

- Pipeline: 2 files, 48 passed (build.test.ts has 36 tests incl. 2 fast-check properties of 300 and 100 runs).
- Full `pnpm test`: 48 files passed, 657 passed, 5 skipped (662), exit 0. The skips existed before this task.
- `pnpm typecheck` exit 0. `pnpm lint` exit 0 (includes import boundaries). Prettier check exit 0.

## 6. Remaining issues

- Real sandbox provider (applying `priorPatch`, `collectPatch` hashing as SHA-256 of the diff text) is not written; tests use a fake provider. If the Docker runner hashes differently, the step reports `build_patch_invalid`.
- Paths with spaces are always rejected. A legitimate file with a space in its name fails the build.
- `PlanSource`, `PatchStore` and the approval checker are interfaces without a Postgres implementation yet. `InMemoryApprovals` satisfies the checker.
- `allowCommands` is a config value (tests use false). Whether the builder needs shell commands is open for P5-03/P4 wiring.
- No secret scan of the diff here (gate 7 in verification).
- Agent errors in the `Patch` schema (for example `..` in `files`) report `build_agent_error`, not `protected_path`.

## 7. Dependencies or blockers

None. Depends on P5-01, P3-02, P3-03. No new packages.

## 8. Recommended next task

P5-03 verify step (run `lathe-verify` as a process on the stored patch).
