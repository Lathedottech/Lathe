# P0-06 CI and protection (devops)

Person: B. Branch: `task/P0-06-ci-codeowners`, from `origin/main` at `132716f`. Date: 2026-11-18.

## 1. Objective completed

P0-06, **partially completed**. The CI workflow and CODEOWNERS file are written, and the CI commands pass locally. Not done yet: the first CI run on GitHub (needs the push) and branch protection on `main`. Branch protection is a GitHub setting that a repository admin (person A) must turn on; it cannot be done from a file.

## 2. Files created or modified

- `.github/workflows/ci.yml` (new): one job on `ubuntu-latest` running `pnpm install --frozen-lockfile`, `typecheck`, `lint`, `test`, `format:check`. Runs on every pull request and on pushes to `main`.
- `.github/CODEOWNERS` (new): protected and security-critical paths owned by both people.
- `.gitattributes`: `*.js`, `*.mjs`, `*.cjs`, `*.tsx` forced to LF line endings.

## 3. Technical decisions

- **Token is read-only** (`permissions: contents: read`) and checkout uses `persist-credentials: false`. Rejected: default permissions, which can write to the repository.
- **Node and pnpm versions come from `.nvmrc` and `packageManager`**, so CI and local use the same versions without a second copy. Rejected: hard-coding versions in the workflow.
- **Both people own every protected path.** GitHub never counts the PR author's approval, so the other person is always the required reviewer. This matches the two-person review rule. Rejected: one owner per path, which would leave that person unable to get a code-owner review on their own change.
- **CODEOWNERS paths** follow `docs/agents/team.md` §3: `packages/verification-harness/`, `tests/harness-selftest/`, `.github/`, and `packages/application-foundation/src/{auth,tenancy,authz}`. The task text lists `tenancy` and `authz`; `auth` is added because `team.md` also requires security approval for it.
- **LF for JavaScript files.** `pnpm format:check` failed on a Windows checkout of `main`: `eslint.config.js` had CRLF in the working copy because `.gitattributes` only forced LF for `.ts` and `.json`. The file in Git was already LF, so Linux CI would have passed, but every Windows developer saw a failure. Rejected: reformatting the file, which changes nothing in Git.
- **Integration tests are not in CI yet.** `pnpm test:integration` and its Postgres need P1-01, which is not merged into `main`. Adding a Postgres service job now would fail on a missing script.

## 4. Tests executed

In the worktree `..\Lathe-P0-06` on Windows, Node v24.14.0, pnpm 9.15.9:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm exec prettier --list-different .
git ls-files --eol eslint.config.js
```

## 5. Test results

Before the `.gitattributes` change, on `main`: typecheck, lint and test exit 0; `format:check` exit 1. `prettier --list-different .` printed `eslint.config.js`. `git ls-files --eol` showed `i/lf w/crlf attr/text=auto`.

After the change and a fresh checkout of the file, `git ls-files --eol` shows `i/lf w/lf attr/text eol=lf`, and:

| Command | Result | Exit |
|---|---|---|
| `pnpm install --frozen-lockfile` | `Done in 2.9s` | 0 |
| `pnpm typecheck` | both packages `Done` | 0 |
| `pnpm lint` | no findings | 0 |
| `pnpm test` | `Tests 2 passed (2)` | 0 |
| `pnpm format:check` | `All matched files use Prettier code style!` | 0 |

**Not run:** the workflow on GitHub Actions. It runs after the branch is pushed and a pull request is opened. **Not checked:** CODEOWNERS syntax on GitHub. GitHub shows errors in this file on its page after the push.

## 6. Remaining issues

- **Branch protection on `main` is not set** (human task, repository admin). Settings → Branches → rule for `main`: require a pull request, require 1 approval, require review from Code Owners, require status check `typecheck, lint, test, format`, block force pushes and deletions. The check name appears in the list only after CI has run once.
- **Actions are pinned by major tag (`@v4`), not by commit SHA.** SHA pinning protects against a moved tag and is recommended for later.
- **CI test of the acceptance criteria** ("CI required on PRs; direct push to `main` blocked", tested by a test PR) can only be done after branch protection exists.
- Integration test job with a Postgres 16 service to add after P1-01 merges.
- Not run on Node 22 locally. CI uses Node 22 from `.nvmrc`.

## 7. Dependencies or blockers

Person A must enable branch protection. GitHub usernames confirmed: A `@ousssamarahmani` (repository owner), B `@HammaBG`.

## 8. Recommended next task

Open a pull request from this branch to see CI run, then person A turns on branch protection. After P1-01 merges, add the integration test job.
