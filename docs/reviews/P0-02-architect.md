# Review: P0-02 Lean monorepo

- **Reviewer:** architect, run by the coordinator on behalf of person A (project lead). Human sign-off: Oussama Rahamni, 2026-11-17.
- **Author report:** [docs/reports/P0-02-devops.md](../reports/P0-02-devops.md)
- **Reviewed tree:** `main` at `132716f` (the scaffold moved to `packages/` by ADR 0007).
- **Verdict:** **Approve.** One acceptance item (Postgres starts with the right roles) is not verified, because Docker Desktop is stopped. It is carried as condition C1 below and blocks P1-02, not P0-02.

## Re-run by the reviewer (2026-11-17, Node v24.14.0, pnpm 9.15.9, Windows)

| Command | Exit code | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | Lockfile up to date |
| `pnpm typecheck` | 0 | Both packages pass `tsc` |
| `pnpm lint` | 0 | No findings |
| `pnpm test` | 0 | 2 test files, 2 tests passed |
| `pnpm format:check` | 0 | All matched files formatted |

## Can the checks fail? (planted probes, removed afterwards)

| Probe | Exit code | Evidence |
|---|---|---|
| `const n: number = "not a number"` in `packages/verification-harness/src/` | `pnpm typecheck` exit 2 | `error TS2322: Type 'string' is not assignable to type 'number'.` |
| `expect(1).toBe(2)` test in the same folder | `pnpm test` exit 1 | Failing test reported |

Both probe files were deleted, and `git status` showed no trace of them.

## Against the acceptance criteria

| Criterion | Result |
|---|---|
| Only the packages whose task has started | Pass: `packages/application-foundation`, `packages/verification-harness` |
| TypeScript strict, `noUncheckedIndexedAccess` | Pass: set in `tsconfig.base.json` |
| ESLint, Prettier, Vitest configured | Pass |
| One real test per package | Pass, as runner smoke tests only |
| PostgreSQL 16 compose with owner and non-owner app roles | Partial: compose file is valid and rejects missing variables (`required variable LATHE_DB_APP_PASSWORD is missing a value`). Role script not executed |
| Secrets in env only, `.env.example` names only | Pass: no values in `.env.example`; gitleaks found no leaks on 2026-11-17 |

## Findings

1. **C1 (condition, blocks P1-02):** start Postgres with `docker compose -f infra/docker-compose.yml --env-file .env up -d`, then confirm from `pg_roles` that both roles are `NOSUPERUSER` and `NOBYPASSRLS` and that the app role does not own `public`. Owner: B (devops). Needs Docker Desktop running.
2. **Minor:** Node 22 (the `.nvmrc` target) is not tested; only Node 24 ran. CI (P0-06) should run on Node 22.
3. **Minor:** `typescript` is pinned to 6.0.3 because of the `typescript-eslint` peer range. Accepted; revisit when `typescript-eslint` supports newer versions.
4. **Note:** the smoke tests prove the runner works, not any feature. Do not cite them as feature evidence.
