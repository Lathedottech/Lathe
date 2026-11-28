# Team Operations

Multi-tenant team workspace built from `templates/app-starter` on `@lathe/application-foundation`
(task P7-02). Teams contain projects, projects contain tasks, and access follows the P7-01
hierarchy **org → team → project**: a role granted on a team applies to that team and its projects,
and an explicit deny on a team or project wins over everything, including the org owner.

## Roles

| Role          | Org-wide                                                                 |
| ------------- | ------------------------------------------------------------------------ |
| `owner`       | everything, and change or remove members (an org always keeps one owner) |
| `manager`     | create teams and projects, manage grants and denies, delete tasks        |
| `member`      | read every team and project, create and update tasks                     |
| `guest`       | nothing org-wide: works only where a team or project grant gives a role  |
| `contributor` | grant-only role: read and work on tasks in the granted team or project   |
| `reader`      | grant-only role: read the granted team or project                        |

A team is a foundation scope of kind `team` and a project a scope of kind `project`; the database
refuses a team or project without its scope, of the wrong kind, or in another org. A team or
project of the caller's org that they may not read answers 403; one of another org answers 404,
like one that does not exist. Lists only show what the caller may read.

## API (all through `defineAction` / `defineScopedAction`)

| Route                                            | Permission (checked on the scope chain)      |
| ------------------------------------------------ | -------------------------------------------- |
| `GET /v1/teams`                                  | `scopes.read` (filters by `teams.read`)      |
| `POST /v1/teams`                                 | `scopes.manage` org-wide                     |
| `GET /v1/teams/:teamId`                          | `teams.read` on the team                     |
| `POST /v1/teams/:teamId/projects`                | `scopes.manage` on the team                  |
| `GET /v1/projects/:projectId`                    | `projects.read` on the project               |
| `GET, POST /v1/projects/:projectId/tasks`        | `tasks.list`, `tasks.create`                 |
| `GET, PATCH, DELETE …/tasks/:id`                 | `tasks.read`, `tasks.update`, `tasks.delete` |
| `POST /v1/scopes/grants`, `…/grants/revoke`      | `scopes.manage` on the scope                 |
| `POST /v1/scopes/denies`, `…/denies/remove`      | `scopes.manage` on the scope                 |
| `GET /v1/scopes/:scopeId/rules`, `…/permissions` | `scopes.manage`, `scopes.read`               |

## Run locally

Needs the repository `.env` (names in `.env.example`) and PostgreSQL from `infra/`.

```sh
pnpm --filter @lathe/team-operations db:create
pnpm --filter @lathe/team-operations migrate
pnpm --filter @lathe/team-operations seed   # orgs a and b, one user per role, password LATHE_TEST_PASSWORD
pnpm --filter @lathe/team-operations dev
```

Seed users are `<role>@team-operations-org-<a|b>.test`.

## Tests

- `pnpm test` (repository root): unit tests, including the C1 contract check.
- `pnpm --filter @lathe/team-operations test:integration`: HTTP-level tests against PostgreSQL as
  the app role: inheritance, explicit deny, no escalation, isolation between orgs, database checks.
- `pnpm --filter @lathe/team-operations test:e2e`: Playwright smoke test.

`src/tenant-contract.ts` is the C1 contract. C1 v1 cannot describe nested resources or scopes, so
only `teams` is declared; every other route is in `UNDECLARED_ROUTES` with the reason.
