# Contributing

Status: Proposed conventions, effective after blueprint approval.

## Workflow
1. Pick a task ID from [TASKLIST.md](TASKLIST.md). One task per branch: `task/<ID>-short-name`.
2. Write or update tests first for behaviour changes.
3. Open a PR referencing the task ID. CI gates must pass. One human review required.
4. PRs touching protected paths (`packages/verification-harness/`, `.github/`, `packages/application-foundation/src/{tenancy,authz}`) require CODEOWNERS approval and must not be authored by an agent session that also changed app code.

## Code
- TypeScript `strict`, no `any` without a comment. Zod at every trust boundary.
- Module boundaries: packages import only through their public `index.ts`. No cyclic dependencies (lint-enforced).
- No stubs that report success. Unimplemented paths throw `NotImplementedError` and are listed in the task.
- Authorization: every handler declares a permission. Default is deny.
- Every tenant-owned table has `org_id` and an RLS policy.
- Structured logging only; no secrets in logs.

## Commits
Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Reference the task ID.

## Using Kiro while developing Lathe
Kiro IDE and Kiro Crew are allowed for development. Agent output is reviewed like any other contribution. Agents must not change verification policy to make a failing check pass.

## ADRs
Architectural changes need an ADR in [`docs/adr/`](docs/adr/README.md) (context, options, decision, consequences).
