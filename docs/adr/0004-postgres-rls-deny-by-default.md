# ADR 0004: PostgreSQL with Row-Level Security and app-layer deny-by-default (D4)

## Status
Accepted, 2026-11-15, approved by project lead (person A). Task P0-03.

## Context
Both apps are multi-tenant, and the central claim of Lathe is that an agent cannot ship a tenant-isolation bug unnoticed. Isolation therefore needs a database-level control that survives an application-layer mistake, plus a second layer in the application.

## Options considered
1. **PostgreSQL 16 with RLS and app-layer deny-by-default.** Two independent layers.
2. App-layer filtering only (`WHERE org_id = ?`). Rejected: a single missing filter leaks data, which is the bug class the harness is meant to catch.
3. Database or schema per tenant. Not evaluated in the repository documents. Not chosen: heavier migrations and operations for an MVP.
4. Session-level `SET` for tenant context. Rejected: pooled connections can leak context.

## Decision
- Every tenant table has `org_id NOT NULL`, created through `tenantTable()`, with `ENABLE` and `FORCE ROW LEVEL SECURITY` and a policy on `current_setting('app.org_id')`.
- Access only through `withTenant(orgId, fn)`, a transaction using `SET LOCAL app.org_id`.
- The app role is not the table owner and has no `BYPASSRLS`. Migrations run as a separate owner role.
- The org comes from the authenticated membership, never from client input. Foreign-org resources return 404.
- Every action uses `defineAction({ permission, input, handler })`. Unknown role or permission, missing membership, or an error in `can()` all deny. Audit events are written in the same transaction and the audit table has no UPDATE or DELETE grants.

## Consequences
- Isolation holds even if a query omits its filter, provided the connection uses the app role.
- Cost: every test and harness run needs a real Postgres and the non-owner role. Mocking the database is not allowed.
- Risks: owner-role bypass, context leaking through pooled connections, a misconfigured policy. The harness suites target these.
- Revisit if: hierarchical scopes (P7-01) cannot be expressed with one `org_id` policy, or performance of policies becomes a problem.

## Verification
P1-01: app role has no `BYPASSRLS`, audit UPDATE denied. P1-02: no or wrong context returns zero rows, concurrent pool-leak test. P1-05: fast-check shows no grant without explicit permission. P2-04 and P2-05: tenant isolation and RBAC suites catch planted bugs. P10-01: isolation suite against the deployed URL.
