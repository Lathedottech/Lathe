---
inclusion: fileMatch
fileMatchPattern: ["**/*.ts", "**/*.tsx", "**/*.sql", "**/package.json", "**/tsconfig*.json"]
---

# Engineering standards

## Stack
| Decision | Status |
|---|---|
| TypeScript monorepo, pnpm workspaces, Node 22 (`.nvmrc`), no Turborepo | Approved (D1) |
| PostgreSQL 16 with Row-Level Security | Approved (D4) |
| Drizzle ORM with SQL migrations | Recommended, ADR pending (D7) |
| Next.js for Workspace and apps | Recommended, ADR pending (D8) |
| Better Auth for authentication; orgs, memberships and RBAC are our code | Recommended, ADR pending (D10) |
| Fastify + Zod for the Engine API | Proposed |
| Vitest, fast-check, Playwright | Proposed (see `testing.md`) |

Do not introduce a library that contradicts this table. If a pending decision blocks you, send a handoff request to `architect`. Pin versions, commit the lockfile, never hand-edit it, and state the reason for each new dependency in the task report.

## Naming
kebab-case files and folders · PascalCase types, classes, React components · camelCase values and functions · UPPER_SNAKE constants · SQL snake_case, plural table names, `<thing>_id` foreign keys · tests next to code as `*.test.ts`, cross-package tests in `tests/` · branch `task/<ID>-short-name` · Conventional Commits mentioning the task ID.

## Type safety
- `strict` on, plus `noUncheckedIndexedAccess`. No `any` without an adjacent comment explaining why; prefer `unknown` and narrow.
- Every external input (HTTP, env, DB rows from raw SQL, agent output, files, ACP messages) is parsed with Zod at the boundary. Inside the boundary, use the parsed types only.
- Use branded ID types (`OrgId`, `UserId`, `RunId`) so a tenant ID cannot be swapped with another ID.
- Discriminated unions for states and results, with exhaustive `switch` (`never` check).
- Export only through each package's `index.ts`. No import cycles.

## Error handling
- Expected failures (validation, not found, forbidden, conflict) are typed domain errors with a stable `code`. Programmer errors throw and surface.
- Never swallow errors. No empty `catch`. Re-throw with context (`cause`) or handle fully.
- Map errors to HTTP status only in the API layer. Responses never contain stack traces, SQL or internal paths.
- Unimplemented paths throw `NotImplementedError` and are listed in the task report. Do not return fake success.
- Time and randomness are injected (clock, id generator), never read ambiently in domain logic.

## API design
- JSON over HTTP, versioned prefix `/v1`. Request and response schemas are Zod schemas in `contracts/api.ts`.
- One error shape: `{ code, message, requestId }`. Lists are cursor-paginated. Run progress uses Server-Sent Events.
- Authorization rules (permissions, org scoping, 404 for foreign resources) are in `security.md`; do not restate them per endpoint.
- Never accept a pass/fail verdict, a role, or an org ID from the client as an authorization input.

## Database
- Forward-only SQL migrations, reviewed like code. Tenant tables follow the checklist in `security.md`.
- `uuid` primary keys, `timestamptz` for all times, `created_at`/`updated_at` set by the database.
- Composite indexes lead with `org_id` on tenant tables.
- Parameterized queries only. No string-built SQL.
- Migrations and seed data never contain real credentials or personal data.

## Code review
- Every task goes through the reviewer listed in `docs/agents/task-ownership.md`. Authors never review their own work.
- Reviewers re-run typecheck, lint and tests themselves and attach their own output in `docs/reviews/<ID>-<reviewer>.md`.
- Review checks: matches the task's acceptance criteria and the contracts; stays in the author's owned paths; tests exist and can fail; no new dependency without reason; no weakened or skipped test; no secrets; logs contain no sensitive data.
- Changes touching identity, tenancy, authorization, sandbox, evidence, delivery or protected paths also need `security`.
- Changes to `packages/verification-harness/` or `.github/` need CODEOWNERS approval.
