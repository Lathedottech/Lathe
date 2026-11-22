# P3-03 backend report: evidence hash chain, redaction, approvals

## 1. Objective completed
P3-03 completed (unit, tamper and property tests). Integration tests were not run (see 6).

## 2. Files created or modified
- `services/factory-engine/src/evidence/{canonical,chain,redact,evidence-log,index}.ts`, `evidence.test.ts`
- `services/factory-engine/src/approvals/{approvals,index}.ts`, `approvals.test.ts`
- `services/factory-engine/src/index.ts` (two export lines)
- `docs/reports/P3-03-backend.md`

## 3. Technical decisions
- SHA-256 chain over prev hash + canonical JSON (sorted keys), genesis for first entry. Rejected: hashing insertion-ordered JSON (hash would depend on key order).
- Redaction runs before an entry is hashed and stored, on values and keys. Rejected: redacting on read (secret would already be stored).
- Approval binds subject + content SHA-256 + approver + time; a different current hash is rejected as stale. Newer approvals supersede, history kept. Rejected: mutable approval rows.
- Truncation is detectable only against a recorded head hash or length; the test documents this.

## 4. Tests executed
- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm exec prettier --check services`
- `pnpm exec vitest run services/factory-engine/src/evidence services/factory-engine/src/approvals`

## 5. Test results
- install, typecheck, lint (incl. import boundaries), prettier: exit 0.
- `pnpm test`: 20 files, 251 tests passed, exit 0 (third run). Run 1 had one timeout (5000 ms) in `scripts/import-boundaries` test under load; run 2 crashed the node process (exit 134); neither touched P3-03 code. Run 3 was clean.
- Evidence + approvals: 2 files, 25 tests passed.

## 6. Remaining issues
- Evidence log is in-memory/interface based; no Postgres evidence table wiring. Integration tests not run (Postgres/Docker not used for this task).
- The timeout and crash flakes above are unexplained; hypothesis: machine load from 20 parallel workers.

## 7. Dependencies or blockers
Stacked on P3-02 (PR #20).

## 8. Recommended next task
Persist evidence and approvals in Postgres under RLS, then wire into the orchestrator.
