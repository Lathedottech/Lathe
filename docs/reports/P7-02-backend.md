# Report: P7-02 Team Operations scaffold, teams, projects, tasks (backend)

Branch `task/P7-02-team-operations`, from `main` at `b43fc9e`.

## 1. Objective completed

P7-02 **completed, pending review** (architect). `apps/team-operations` generated with
`pnpm new-app team-operations`, then: roles, teams, projects and tasks on the P7-01 hierarchy
org → team → project, scope administration routes, pages, C1 contract, seed, tests. It uses the
same `packages/application-foundation` as Support Desk (workspace package, no copy).
Acceptance "Harness passes" is **not run**: the harness suites (P2-04, P2-05, P2-06) are not on
`main`, and C1 v1 cannot describe scopes (section 6).

## 2. Files created or modified

- `apps/team-operations/**` (new, from the template), then:
  `src/server/{authz,schema,work}.ts`, `migrations/team-operations_0001_teams.sql`,
  `src/app/v1/{teams,projects,scopes}/**` (12 route files), `src/app/(app)/{teams,projects}/**`
  (3 pages), `src/app/_components/forms.tsx` (create form, task controls),
  `src/tenant-contract.ts` and test, `src/server/{config.test,app.integration.test}.ts`,
  `e2e/smoke.spec.ts`, `README.md`. The template's `notes` resource was removed.
- `pnpm-lock.yaml` (new workspace package).

## 3. Technical decisions

| Decision | Rejected alternative | Reason |
|---|---|---|
| A team's / project's id **is** its foundation scope id, enforced by a composite FK `(org_id, id, scope_kind) → scopes (org_id, id, kind)` | Separate ids with a `scope_id` column | One id everywhere; the database refuses a team without its scope, of the wrong kind, or in another org (tested) |
| Every team/project/task route is `defineScopedAction` | Org-wide `defineAction` plus checks in handlers | The foundation resolves the scope (foreign/unknown → 404), loads the chain and runs `canInScope` before the handler |
| Lists filter per item with `canInScope` on its own chain | Return everything the org has | A guest with one team grant sees that team only; a deny on a project hides it from the team page, even for the owner |
| Tasks are addressed as `/v1/projects/:projectId/tasks/:id` and the lookup includes `project_id` | `/v1/tasks/:id` | The scope must come from the input; a task id under the wrong project is 404 |
| Assignee must hold `tasks.update` on the project's chain | Any org member | Otherwise a task could be assigned to someone who cannot see it |
| Roles owner / manager / member / guest, plus grant-only contributor / reader | Three roles | `guest` has nothing org-wide, so access through grants is visible and testable; grant-only roles carry no admin permission, so a grant cannot escalate |
| Teams and projects not deletable through the API | Delete routes | Deleting a scope cascades its rules and tasks; out of scope for the scaffold |
| Only `teams` declared in C1; nested routes in `UNDECLARED_ROUTES` | Declare them | C1 v1 cannot fill a parent id; a test fails if a route is neither declared nor listed |

No new dependencies.

## 4. Tests executed

From the repository root: `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`,
`pnpm test:integration` with `POSTGRES_DB=lathe_p702_test` (a fresh database). In
`apps/team-operations`: `pnpm test:integration`, `pnpm test:e2e`. Mutation runs: 6 planted bugs in
`src/server/work.ts` against the integration tests.

## 5. Test results

- `format:check`, `typecheck`: exit 0. `lint`: exit 0, "no dependency violations found
  (336 modules, 961 dependencies cruised)".
- `pnpm test`: 37 files, 511 tests passed, exit 0.
- `pnpm test:integration` on a fresh database: foundation 132, Team Operations 14, template 15,
  Support Desk 19, factory-engine 20 passed, exit 0. (A first run on a database reused from another
  review failed one foundation test because the engine tables were already there; known shared
  test-database issue, not caused by this task.)
- `pnpm test:e2e`: 2 passed (redirect without session; manager creates team, project, task;
  member sees them; guest does not; org B gets "Not found"). The first run failed in my own test
  (`getByLabel('Task')` also matched another label); fixed with `exact: true`.
- Mutations, all caught: lists ignore visibility (3 failed), team id accepted as project (1),
  project list ignores denies (1), task lookup ignores its project (1), any member can be assignee
  (1), project creation checked org-wide instead of on the team (setup failed, all 14 tests did
  not pass).

## 6. Remaining issues

- "Harness passes": **not run** (suites not merged; C1 v1 has no scopes). Needs C1 v2 from the
  handoff `docs/handoffs/backend-to-architect-c1-v2-scopes.md` (not yet acknowledged).
- A team or project of the caller's own org that they may not read answers **403**, not 404:
  `defineScopedAction` resolves the scope first, then denies. Existence inside one org is not a
  secret in this app; cross-org access is always 404. Change in the foundation if A wants 404.
- No delete for teams and projects; no rename.
- UI is minimal; the full UI is P7-04. The shared resources module is P7-03.
- e2e is not in CI.

## 7. Dependencies or blockers

None. P7-01 and P1-07 are merged.

## 8. Recommended next task

P8-02 (CI verify workflow) and P9-02 (Workspace shell against the C4 routes of #32).
