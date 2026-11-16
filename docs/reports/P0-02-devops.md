> Note (2026-11-15): paths in this report predate ADR 0007 (repository structure). skeleton/core is now packages/application-foundation, and erification/ is now packages/verification-harness. Kept unchanged because the report records what was true when written.

# P0-02 Lean monorepo (devops)

## 1. Objective completed
P0-02, **partially completed**: workspace, TypeScript, ESLint, Prettier, Vitest and the Postgres 16 compose file are in place. The "Postgres starts" acceptance check was **not run** (Docker daemon stopped). Nothing was committed.

## 2. Files created or modified
- Root: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` (generated), `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `.env.example`
- `skeleton/core/`: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/index.smoke.test.ts`
- `verification/`: same five files as above
- `infra/docker-compose.yml`, `infra/postgres/init/01-roles.sh`, `infra/postgres/init/roles.sql.in`
- `.gitignore`, `.nvmrc`, `.editorconfig` were pre-existing and untouched.

## 3. Technical decisions
- **Exact pinned devDependencies at root only** (`-E`): `typescript 6.0.3` (compiler; held below 7 because `typescript-eslint 8.73.0` declares peer `<6.1.0`, pnpm warned on 7.0.2), `vitest 5.1.0` (tests), `eslint 10.15.0` + `@eslint/js 10.0.1` + `typescript-eslint 8.73.0` (lint), `prettier 3.10.1` (format). Rejected: caret ranges (not reproducible); `@types/node` (added then removed: unused, and v26 mismatched the Node 22 target).
- **`module: NodeNext`**, so relative imports use `.js` extensions. Rejected: Bundler (Node packages here run directly; Next apps can override later).
- **Extra strictness** beyond the spec: `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noImplicitOverride`. `no-explicit-any` and `ban-ts-comment` are errors.
- **Vitest root `projects`** referencing each package's own config. Rejected: one flat root config (packages would not own their settings).
- **Role bootstrap as `.sh` + `roles.sql.in`**: psql `-v` variables take passwords from container env and quote them with `:'var'` / `:"var"`. The `.in` suffix stops the entrypoint auto-running unparameterised SQL. Rejected: a literal `.sql` with passwords.
- **Roles**: owner role (LOGIN, NOSUPERUSER, NOBYPASSRLS, owns `public`) and app role (LOGIN, NOSUPERUSER, NOBYPASSRLS, not an owner, DML via default privileges, no DDL). Compose binds Postgres to 127.0.0.1 and requires every variable (`:?`), so there are no default passwords.
- **`.prettierignore` excludes `docs/`, `.kiro/`, `*.md`, `comments.json`**: existing docs were not authored under Prettier and reformatting them is out of scope. Prettier covers code and config only.

## 4. Tests executed
`pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`, `docker compose -f infra/docker-compose.yml config`.

## 5. Results
- `pnpm install`: exit 0, lockfile written.
- `pnpm typecheck`: exit 0 (`skeleton/core` and `verification`: Done).
- `pnpm lint`: exit 0, no findings.
- `pnpm test`: exit 0. `Test Files 2 passed (2)`, `Tests 2 passed (2)`.
- `pnpm format:check`: first run failed on 8 config files, so I ran `prettier --write` on them. Re-run: `All matched files use Prettier code style!`, exit 0.
- `docker compose config` works without the daemon. With no env it rejects with `required variable LATHE_DB_APP_PASSWORD is missing a value` (intended). With throwaway placeholder values set only in the shell, `config -q` printed no errors.
- **Not run:** starting Postgres, running `01-roles.sh`, and checking `rolbypassrls`/`rolsuper` on the created roles. Reason: Docker daemon is stopped and I was told not to start it. The role script is **unverified**. Run `docker compose -f infra/docker-compose.yml --env-file .env up -d` and check `pg_roles`. Also not run: a check that the smoke tests can fail.

## 6. Remaining issues
- LICENSE not created (blocked on owner name). `.github/` untouched (P0-06).
- `01-roles.sh` is sourced by the entrypoint; it is untested and may need fixes on first real start.
- Prettier excludes Markdown.
- Node 24 locally vs Node 22 target. `engines` is `>=22`; no run on Node 22.
- `pnpm install` prints a Node `url.parse` deprecation warning from pnpm itself.

## 7. Dependencies or blockers
Docker Desktop must be started by a human to close the "Postgres starts" criterion.

## 8. Recommended next task
Human runs the Postgres start and role check, then P0-06 (CI), which can use these scripts.
