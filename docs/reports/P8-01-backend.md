# P8-01 Branch, commit, draft PR (backend)

## 1. Objective completed

P8-01, **partially completed**: code and unit tests are done against a fake `fetch`. No call to the real GitHub API was made (no token, no target repo available here), so the TASKLIST test "Integration against the repo" is **not run**. Status: Reported, not Done.

## 2. Files created or modified

- `integrations/github/{package.json,tsconfig.json,vitest.config.ts}` (new package `@lathe/github-delivery`; runtime dependency `zod` 4.6.7, already used by the Engine)
- `integrations/github/src/client.ts`, `diff.ts`, `index.ts`, `client.test.ts`
- `services/factory-engine/src/pipeline/deliver.ts`, `deliver.test.ts`
- `services/factory-engine/src/pipeline/index.ts` (export block for deliver)
- `pnpm-workspace.yaml`, `vitest.config.ts` (register the package), `pnpm-lock.yaml` (generated)

## 3. Technical decisions

- **`fetch` against the REST API, no Octokit.** The TASKLIST row says Octokit; the task brief said no new SDK. Rejected: Octokit (extra dependency with a wide API surface that includes merge).
- **Public surface is `createDeliveryBranch`, `commitPatch`, `openDraftPullRequest`.** Every request also passes an internal method+path allow-list, so merge, reviews, delete, actions and workflow endpoints cannot be reached even by a later edit. Rejected: a generic `request()` method.
- **The verified unified diff is applied inside the client** (`diff.ts`) against base file contents read at the base commit, because the Git Data API takes contents, not diffs. Binary patches, renames, copies, mode changes and non-matching context are refused. Patch paths under `.git/`, `.github/`, `packages/verification-harness/` or containing `..` are refused again here (defense in depth; the Engine already rejects them). Rejected: shelling out to `git apply` (needs a checkout and a process in the token holder).
- **Branch update is `force: false`.** A branch that moved is an error.
- **`DeliveryPort` is defined Engine-side in `deliver.ts`.** The client satisfies it structurally. Only a future composition root imports `integrations/github`. `main.ts` does not exist, so nothing is wired and `LATHE_GITHUB_TOKEN` is not read anywhere yet.
- **Token handling:** held in a private field, sent only in the `Authorization` header, never in URLs, bodies or messages. Errors carry the operation and HTTP status only (response bodies are dropped), network errors keep only the error name, and `toJSON` hides the token.
- **Approval binding:** subject `delivery:<runId>`, content = the verification binding hash. The step reads the last `verify_result` evidence entry (and the `verify_gate` entries before it) rather than trusting any caller input, and requires the evidence chain to verify.
- **Retry:** failure leaves the run in AWAITING_APPROVAL with a `delivery_error` entry. `delivery_branch`, `delivery_commit` and `delivery_pr` entries let a retry resume after the last completed API step.
- Evidence summary JSON is committed at `.lathe/evidence/<runId>/summary.json` (TASKLIST).

## 4. Tests executed

- `pnpm install --frozen-lockfile`, then `pnpm install --no-frozen-lockfile` after adding the package, then `pnpm install --frozen-lockfile --offline`
- `pnpm exec vitest run --project @lathe/github-delivery`
- `pnpm exec vitest run --project @lathe/factory-engine services/factory-engine/src/pipeline/deliver.test.ts`
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm exec prettier --check services integrations docs`

## 5. Test results

- GitHub client: 17 passed (request order, `draft: true`, branch format against the CI regex, repo refusal with zero requests, no merge/review/delete/workflow request, public surface, token absent from errors for HTTP and network failures, diff apply and refusals).
- deliver: 16 passed (approval missing or stale and patch mismatch refuse with zero API calls, success gives DELIVERED with PR URL in evidence, API error at branch/commit/PR stays AWAITING_APPROVAL, retry resumes, PR body has binding hash and no token, fault label).
- Root: typecheck exit 0, lint exit 0 (import boundaries: no violations, 378 modules), `pnpm test` 51 files, 710 passed, 5 skipped (skips pre-existing, not added here), prettier exit 0, frozen install exit 0.

## 6. Remaining issues

- Real GitHub integration run not done (needs a fine-grained token for one repo).
- No composition root (`main.ts`) yet: nothing reads `LATHE_GITHUB_TOKEN` or wires the client into `DeliveryPort`. Needs a small adapter that passes the Engine's `project` and `evidenceFiles`, which the client already accepts.
- "Status polling" from the TASKLIST row is not implemented (no check-status call).
- The delivery approval record is checked through an `approvals.check` interface; durable approvals and the API route that records the approval (P3-03 / P9-06) are not part of this task.
- Redaction of the token in the PR body and evidence relies on the existing `redactString` patterns; the unit test covers a `github_pat_` token.
- `commitPatch` does not set committer identity or signing; commits use the token owner's identity.
- Diff applier handles ordinary text diffs only; a very large patch (more than 200 files or 1 MB per file) is refused.
- `security` review is required (token holder) and has not happened.

## 7. Dependencies or blockers

Depends on P5-03 (done). Stacked on #44. Security review and a GitHub test repository with a token are needed before this can be Done.

## 8. Recommended next task

P8-02 CI verify workflow review, then a composition-root task that wires `GitHubDeliveryClient` to `DeliveryPort`, followed by the real-repo integration run.
