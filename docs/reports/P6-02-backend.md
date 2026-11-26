# Report: P6-02 Support Desk SLA (backend)

Branch `task/P6-02-sla`, from `main` at `d9a97c9` (P6-01 merged in #30).

## 1. Objective completed

P6-02 **completed, pending review** (architect). SLA policy per priority, first-response and
resolution due times, status per target (met, missed, on track, at risk, breached), staff queues
of breached and at-risk tickets, an injected clock, and SLA badges in the ticket pages.
Acceptance "breach computed correctly": fast-check properties with a fake clock, plus integration
tests that move an injected clock.

## 2. Files created or modified

- `apps/support-desk/src/sla/{policy,sla,index}.ts` (new): policy table and pure SLA functions.
- `apps/support-desk/src/sla/sla.test.ts` (new): 7 properties (2000 runs each), 3 examples.
- `apps/support-desk/src/server/clock.ts` (new): the app clock, replaceable in tests.
- `apps/support-desk/migrations/support-desk_0002_sla.sql` (new): due-time and done-time
  columns, backfill, checks, partial indexes.
- `apps/support-desk/src/server/{schema,tickets}.ts`: columns; due times on create and on priority
  change; first response on the first public staff reply; resolved time; `sla` in every ticket
  response; `?sla=breached|at_risk` list filter.
- `apps/support-desk/src/app/(app)/_components/sla-badge.{tsx,module.css}` (new), ticket list and
  detail pages: badges, both targets, "SLA breached" / "SLA at risk" staff queue links.
- `apps/support-desk/src/server/app.integration.test.ts`: 7 SLA tests. `e2e/smoke.spec.ts`: SLA
  shown on a new ticket. `README.md`: SLA section. `package.json`: `fast-check` 4.10.3 (dev).

## 3. Technical decisions

| Decision | Rejected alternative | Reason |
|---|---|---|
| Wall-clock targets: urgent 1 h / 4 h, high 4 h / 1 d, normal 1 d / 3 d, low 2 d / 7 d | Business hours and holiday calendars | Large extra scope before the Dec 1 freeze; the policy table can change later |
| Due times stored on the ticket | Computed from the policy on every read | A later policy change does not rewrite the SLA of existing tickets |
| Priority change recomputes both due times from the **opening** time | From the change time | Raising a priority cannot buy a late ticket more time |
| First response = first public reply by staff who is not the requester | Any comment | Internal notes and the requester's own replies are not a response |
| Resolved time set the first time the ticket is resolved or closed; reopening clears it | Keep the first resolution | A reopened ticket is open again against the same due time |
| "At risk" from 75 % of the window | Fixed minutes | Same meaning for 1-hour and 7-day targets |
| Clock as a replaceable module (`clock.ts`), pure SLA functions take the time | `new Date()` in handlers | testing.md: time is injected |
| Ticket `created_at` and comment `created_at` from the same clock | Database `now()` | Due times, opening time and replies agree, also under a fake clock |
| Migration lifts `FORCE ROW LEVEL SECURITY` for the backfill only, inside its transaction | Backfill through the app role | The owner is subject to the forced policy, so a plain `UPDATE` saw no rows (first attempt failed on `NOT NULL`) |
| SLA shown to requesters too | Staff only | The requester sees when to expect an answer; no other ticket's data is involved |

`fast-check` 4.10.3 is already used by the foundation and the harness (same version); it is a
dev dependency of the app only.

## 4. Tests executed

From the repository root: `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`,
`pnpm test:integration` with `POSTGRES_DB=lathe_p701_test` (see section 6 for the default dev
database). In `apps/support-desk`: `pnpm test:e2e`. Mutation runs: 4 planted bugs in `src/sla`
against the unit tests, 4 in `tickets.ts` against the integration tests.

## 5. Test results

- `format:check`, `typecheck`, `lint`: exit 0.
- `pnpm test`: 34 files, 452 tests passed, exit 0 (SLA: 10 tests, properties at 2000 runs).
- `pnpm test:integration`: foundation 132, template 15, Support Desk 26 passed, exit 0.
- `pnpm test:e2e` (Support Desk): 3 passed.
- Migration on databases with existing tickets: the app's own database (56 older tickets, run with
  the default `POSTGRES_DB`) and `lathe_p701_test_support_desk`; both applied, every row
  backfilled (the `NOT NULL` and check constraints hold), and `tickets` is back to forced RLS
  (`relrowsecurity = t, relforcerowsecurity = t`).
- Mutations, all caught: breached at the due time itself (1 failed), late reply counted as met (2),
  overall takes the better target (1), urgent given normal targets (3), internal notes count as
  first response (1), priority change keeps old due times (1), at-risk queue includes breached
  tickets (1), staff reply on their own ticket counts as first response (1, after adding the test
  "staff replying on a ticket they opened themselves is not a first response": the first round
  showed this mutation surviving).

## 6. Remaining issues

- No business hours, no pause while pending, no per-org policy.
- `pnpm test:integration` against the default dev database `lathe` fails one foundation test
  ("every table with a NOT NULL org_id was defined with tenantTable()"), because the first P1-07
  run left a `notes` table there. Not caused by P6-02; clean that database or use a fresh one.
- The C1 contract is unchanged (the `sla` list filter is an optional query field).
- SLA notifications or escalation (e-mail is a product non-goal) are not part of this task.

## 7. Dependencies or blockers

None. P6-01 is merged.

## 8. Recommended next task

P9-02 Workspace shell (against the C4 routes of #32), and P7-02 Team Operations.
