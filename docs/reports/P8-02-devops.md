# Report: P8-02 CI verify workflow (devops)

Branch `task/P8-02-ci-verify`, from `main` at `b43fc9e`.

## 1. Objective completed

P8-02 **partially completed, pending review** (architect). `.github/workflows/verify.yml` re-runs
`lathe-verify` on Lathe draft PRs as a second check, with the harness taken from the PR's base
commit. Acceptance "Required check on `main`" is **not done**: it is a branch-protection setting
(a human permission change) and should be turned on once the remaining gates are on `main`
(section 6). "Test PR with failing change" is covered by a test against real git and the real
`lathe-verify` (section 5), not by a PR on GitHub.

## 2. Files created or modified

- `.github/workflows/verify.yml` (new).
- `scripts/ci/verify-pr.mjs` (new): the step script (branch check, app selection, patch, call to
  the trusted `lathe-verify`, job summary).
- `scripts/ci/verify-pr.test.mjs` (new): 22 tests (17 unit, 5 with real git and `lathe-verify`).

## 3. Technical decisions

| Decision | Rejected alternative | Reason |
|---|---|---|
| `pull_request` trigger, `permissions: contents: read` | `pull_request_target` | No secrets and a read-only token, also for fork PRs; `pull_request_target` would run PR content with write access |
| Harness and step script checked out from `pull_request.base.sha`; PR head checked out separately as data | Run the PR's own harness | A PR (including an agent patch) cannot change what verifies it (architecture.md: harness from the trusted base) |
| Nothing from the PR is installed or run by the workflow | `pnpm install` in the PR checkout | No PR code runs in this job; later gates (P2-03+) bring their own sandboxing |
| Only branches `lathe/<project>/<run-id>` (C4 `Delivery.branch`); job `if:` plus the exact pattern in the script | Every PR | `lathe-verify` checks agent patches: a human PR to the harness or `.github/` would always fail the protected-path gate. Human PRs keep the normal CI and CODEOWNERS review |
| The patch must stay in one `apps/<app>/`; anything else is `error` | Verify every app | A Lathe run builds a bounded module inside one app; `apps/workspace` is never a target |
| Patch = `git diff --binary --full-index --no-renames <merge-base> HEAD` | Diff against the base tip | Only what the PR changes, even if `main` moved |
| PR-controlled values (branch name) passed via `env`, never `${{ }}` inside `run` | Inline expressions | Avoids shell injection through branch names |
| Result in the job summary; no artifact upload | `actions/upload-artifact` | One action less to pin and trust; the report is printed and summarized |
| Real-run tests skip on Windows | Run them everywhere | C3 `VerifyRequest.worktree` accepts POSIX paths only; they run in CI (ubuntu) and were run in a Linux container locally |

No new dependencies. Actions pinned to the same commits as `ci.yml`.

## 4. Tests executed

- `npx vitest run --project scripts scripts/ci` on Windows and in a `node:22-bookworm` container
  (fresh copy of the tree, own `pnpm install --frozen-lockfile`, git installed).
- `docker run rhysd/actionlint:1.7.7` on `verify.yml` and `ci.yml`.
- `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- Mutations of `verify-pr.mjs`: changes outside the app accepted; branch pattern loosened to
  `^lathe\/`.

## 5. Test results

- Linux container: 22 passed, exit 0. Real runs, as printed by `lathe-verify`:
  - symlink inside `apps/support-desk` pointing at `packages/verification-harness`:
    `lathe-verify: failed (protected-paths=failed, static=not_run, …)`, step exit 1;
  - a change in `packages/verification-harness/src/runner.ts`: rejected before any gate, exit 2;
  - a valid change in `apps/support-desk/src`: `protected-paths=passed, static=error, …`,
    overall `error`, exit 2 (gates P2-03…P2-07 are not on `main`; see section 6);
  - non-Lathe branch: "nothing to verify", exit 0, no report.
- Windows: 17 unit passed, 5 skipped (POSIX-only, above).
- actionlint: exit 0, no findings.
- `format:check`, `typecheck`, `lint`: exit 0. `pnpm test`: 35 files, 479 tests passed, 5 skipped
  (the POSIX-only tests above), exit 0.
- Mutations, both caught: outside-app changes accepted (several `selectApp` tests failed); loose
  branch pattern (`isLatheBranch` tests failed).

## 6. Remaining issues

- **Every Lathe PR is red today**: only the protected-path gate exists on `main`; the others
  report `error`, so the overall result is `error`. This is correct (a missing gate must never
  pass) and only affects `lathe/` branches, which do not exist yet. It turns green when P2-03…P2-07
  merge.
- **Required check**: turn on "Require status checks: lathe-verify (trusted harness)" in branch
  protection for `main` after the gates land. A skipped job (human PRs) satisfies it.
- Gates that run tests (P2-03+) will execute the agent's code in this job; they must keep the
  read-only token and no secrets. Verification workflow content follows handoffs from
  `verification` (team.md §3).
- The workflow itself has not run on GitHub yet (needs this PR; it skips itself on a `task/`
  branch).
- The Engine's "compare CI vs local verifier result" step (06-github-delivery.md) is P8-01 / P5.

## 7. Dependencies or blockers

None for the workflow. A green result needs P2-03…P2-07 on `main`.

## 8. Recommended next task

P9-02 Workspace shell.
