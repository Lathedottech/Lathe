# P0-06 CI follow-up (devops)

Person: B. Branch: `task/P0-06-ci-postgres`, from `origin/main` at `9ceb1a2`. Date: 2026-11-19.

## 1. Objective completed

P0-06 follow-up, **completed locally; first GitHub run pending the pull request**. CI now runs the PostgreSQL integration tests (RLS, tenant isolation, audit append-only) on a fresh database, and all actions are upgraded to Node 24 releases pinned by commit SHA. The direct push of P0-06 to `main` is documented in an addendum to `docs/reports/P0-06-devops.md`.

Not done: the harness self-test workflow requested in `docs/reports/P2-01-verification.md` section 7. It needs P2-01 merged into `main`; P2-01 has changes requested.

## 2. Files created or modified

- `.github/workflows/ci.yml`: actions upgraded and SHA-pinned; new job `integration tests (PostgreSQL 16)`.
- `docs/reports/P0-06-devops.md`: addendum on how P0-06 reached `main`.
- `docs/reports/P0-06-devops-followup.md` (this file).

## 3. Technical decisions

- **Action versions** (latest releases, checked on 2026-11-19 through the GitHub releases API; each `action.yml` declares `using: node24`):

  | Action | Before | After | Pinned commit |
  |---|---|---|---|
  | `actions/checkout` | `@v4` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
  | `actions/setup-node` | `@v4` | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
  | `pnpm/action-setup` | `@v4` | v6.1.1 | `73e46992e05b19abd31f2f3c20e0e7370d762115` (peeled from the annotated tag) |

  Pinned by SHA with the version in a comment. Rejected: major tags (`@v7`), which the owner can move to different code. This closes the SHA-pinning item from the P0-06 report.
- **Postgres through the project's own `infra/docker-compose.yml`**, not a GitHub `services:` container. CI then also tests the role bootstrap (`infra/postgres/init/01-roles.sh`) used locally. A `services:` container starts before checkout, so it cannot run that script.
- **Random credentials per run.** A step writes `.env` with three 48-character hex passwords from `/dev/urandom`, masks each with `::add-mask::`, and the integration tests read `.env` as in a local run. No password is stored in the repository or in GitHub secrets. Rejected: fixed passwords in the workflow (`security.md`: no default credentials) and `POSTGRES_HOST_AUTH_METHOD=trust`. `/dev/urandom` instead of `openssl`: the step first used `openssl rand`, which failed in a Debian test container (`openssl: command not found`); `head`, `od` and `tr` are in coreutils everywhere.
- **Separate job**, so the required check `typecheck, lint, test, format` keeps its name and branch protection does not need to change. The new job adds a second check, `integration tests (PostgreSQL 16)`, which should also be required.
- **Role check step** prints `rolsuper` and `rolbypassrls` for both roles in the CI log, as evidence. The integration tests also assert them.

## 4. Tests executed

Windows, Node v24.14.0, pnpm 9.15.9, Docker 26.0.0.

```powershell
# workflow lint (also runs shellcheck on run: scripts)
docker run --rm -v "${PWD}:/repo" --workdir /repo rhysd/actionlint:1.7.7 -color=false .github/workflows/ci.yml
# the exact "Create throwaway database credentials" script, extracted from ci.yml, run on Debian
docker run --rm -v "<tmp>:/w" -w /w node:22-bookworm-slim bash -e step.sh
# the database steps, on a separate compose project and port 5434 so the local dev database is untouched
docker compose -p lathe-ci --env-file <tmp>/.env -f infra/docker-compose.yml down -v
docker compose -p lathe-ci --env-file <tmp>/.env -f infra/docker-compose.yml up -d --wait
docker compose -p lathe-ci ... exec -T postgres psql -U postgres -d lathe -v ON_ERROR_STOP=1 -c "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('lathe_owner', 'lathe_app') ORDER BY rolname;"
pnpm test:integration    # with the variables from <tmp>/.env in the environment
# mutation: RLS off in the CI database, expect the step to fail
docker exec lathe-ci-postgres-1 psql -U postgres -d lathe -c "ALTER TABLE memberships DISABLE ROW LEVEL SECURITY;"
pnpm test:integration
docker compose -p lathe-ci ... down -v
pnpm typecheck; pnpm lint; pnpm test; pnpm format:check
```

Port 5434 replaces `POSTGRES_PORT=5432` only in the local copy, because 5432 and 5433 are used by other containers on this machine.

## 5. Test results

| Check | Result | Exit |
|---|---|---|
| actionlint 1.7.7 | no findings | 0 |
| credentials step on Debian, first version | `step.sh: line 9: openssl: command not found` | 127 |
| credentials step on Debian, `/dev/urandom` version | three `::add-mask::` lines; `.env` has 8 variables; passwords 48, 48, 48 characters, 3 distinct | 0 |
| `docker compose up -d --wait` | `Container lathe-ci-postgres-1 Healthy` | 0 |
| role check | `lathe_app f f`, `lathe_owner f f` | 0 |
| tables before tests | 0 | |
| `pnpm test:integration` on the fresh database | `migrations applied: 0001_initial.sql, 0002_tenancy_rls.sql`, `Test Files 2 passed (2)`, `Tests 41 passed (41)` | 0 |
| `schema_migrations` in the CI database | `0001_initial.sql, 0002_tenancy_rls.sql` | |
| same step after `DISABLE ROW LEVEL SECURITY` on `memberships` | failed | 1 |
| `pnpm typecheck`, `lint`, `format:check` | clean | 0 |
| `pnpm test` | `Tests 65 passed (65)` | 0 |

After the run, `docker compose down -v` removed the CI container and volume. The local dev database (`infra-postgres-1`) kept running.

**Not run:** the workflow on GitHub Actions itself. It runs when the pull request is opened. Local runs used Docker Desktop on Windows, not `ubuntu-latest`.

## 6. Remaining issues

- **Branch protection on `main` is still not confirmed.** Person A: require PR, 1 approval, Code Owners review, and both checks: `typecheck, lint, test, format` and `integration tests (PostgreSQL 16)`. The second name appears in the list after its first run.
- **Harness self-test workflow** (`harness-selftest.yml`): after P2-01 merges. Minimum useful version: run `lathe-verify` with the default gates and require a non-zero exit, so a harness that passes everything fails CI.
- `pnpm/action-setup` v6 bootstraps pnpm 11 internally and then installs 9.15.9 from `packageManager`. If the first run shows a version problem, pin `version: 9.15.9` in the step.
- The job uses `docker compose` from the runner image. GitHub's `ubuntu-latest` includes Docker Compose v2; not checked beyond the docs.

## 7. Dependencies or blockers

Person A: branch protection, and a review of this PR (it touches `.github/`, a CODEOWNERS path). The review covers commit `cc2d0e5` too, which reached `main` without one.

## 8. Recommended next task

P1-03 authentication (Better Auth).
