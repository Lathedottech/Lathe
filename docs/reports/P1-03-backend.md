# P1-03 Authentication via library (backend)

Person: B. Branch: `task/P1-03-auth`, from `origin/main` at `399ff88`. Date: 2026-11-19.

## 1. Objective completed

P1-03, **completed, pending security and architect review**. Email and password authentication with Better Auth: server-side sessions in PostgreSQL, CSRF origin checks, rate-limited sign-in, telemetry off, sign-up closed by default. `getPrincipal(auth, headers)` returns the signed-in user or `null`. `seedDemo()` creates demo orgs, users and memberships. Migration 0003 adds the auth tables and the `memberships.user_id` foreign key left open by P1-01. 23 new integration tests; 5 deliberate mutations, each caught.

Partially met: "seed **script**". `seedDemo()` is a tested function, not a command. A command needs a composition root that reads the environment and owns a connection; that is the template app (P1-07). See section 6.

## 2. Files created or modified

New, all under `packages/application-foundation/`:
- `src/auth/auth.ts`: `createAuth(config)`, `Auth`, `AuthConfig`.
- `src/auth/principal.ts`: `getPrincipal()`, `Principal`.
- `src/auth/seed.ts`: `seedDemo()`.
- `src/auth/schema.ts`: Drizzle tables `users`, `sessions`, `accounts`, `verifications`, `rateLimits`.
- `src/auth/index.ts`: module exports.
- `src/auth/auth.integration.test.ts`: 23 integration tests.
- `migrations/0003_auth.sql`.

Modified:
- `package.json`: `better-auth` 1.7.26 added; `drizzle-orm` 0.44.7 → 0.45.4.
- `src/db/schema.ts`: `memberships.userId` references `users.id`.
- `src/db/test-db.ts`: `createTestUser()`, `deleteTestUsers()`.
- `src/db/schema.integration.test.ts`: real users behind memberships (the new foreign key requires it); the Drizzle-vs-database check now covers the five auth tables; 3 new tests (membership for a missing user, lower-case emails, user delete cascades to memberships).
- `src/tenancy/tenancy.integration.test.ts`: real users instead of random UUIDs. Same assertions.
- `src/index.ts`: exports the auth API.
- `.env.example` (root): names `BETTER_AUTH_SECRET`, `LATHE_DEMO_PASSWORD`. No values.
- `pnpm-lock.yaml`: regenerated.

## 3. Technical decisions

- **Better Auth 1.7.26** (D10, latest on 2026-11-19, published with npm provenance). Rejected: Auth.js (session and credential handling for email and password is weaker), custom code (product non-goal).
- **Drizzle 0.44.7 → 0.45.4.** Better Auth's Drizzle adapter declares `drizzle-orm ^0.45.2`. All P1-01 and P1-02 tests were re-run on 0.45.4 before any auth code was added: `Tests 76 passed` (unit), `Tests 41 passed` (integration). Rejected: bypassing the Drizzle adapter, which would mean a second database layer.
- **Approval.** Both dependencies were approved by person B (the human driving this task) on 2026-11-19. Person A's confirmation should be recorded in the review, as `security.md` asks for human approval of security-relevant dependencies.
- **Better Auth relaxes settings in tests.** Its source turns off the origin check and skips secret validation when `NODE_ENV=test`, which Vitest sets. `createAuth` sets `disableOriginCheck: false` explicitly and validates the secret itself (at least 32 characters), so tests run the production behaviour. Without this, the CSRF tests would have passed for the wrong reason.
- **Telemetry.** Off by default, but Better Auth enables it when `BETTER_AUTH_TELEMETRY` is set, whatever the options say (`enabled = env || option`). `createAuth` sets `telemetry: { enabled: false }` and refuses to start if that variable is truthy.
- **Sessions live in the database; cookie cache off.** Every request reads the session row, so sign-out and expiry take effect at once. Rejected: Better Auth's cookie cache, which keeps a signed-out session valid until the cached cookie expires (mutation 5 shows this).
- **Sign-up closed by default** (`allowSignUp: false`). Secure by default; apps opt in. The seed uses a second instance with sign-up open.
- **`activeOrgId` on the session**, `input: false`, column `sessions.active_org_id`. Needed by `setActiveOrg` in contract C4 v1.1. Only server code (P1-04) sets it. `getPrincipal` returns it as a pointer; P1-05 must still check the membership before `withTenant`.
- **Auth mounted at `/auth`**, matching `AUTH_BASE_PATH` in C4 v1.1. Configurable; the foundation does not import Lathe's contracts.
- **Rate limiting in the database**, 5 sign-in and 5 sign-up attempts per minute per client IP, 100 for other auth routes. Rejected: memory storage, which each process counts separately.
- **Cookies**: prefix `lathe`, always `Secure` (`__Secure-` name), `HttpOnly`, `SameSite=Lax`.
- **Passwords** 12 to 128 characters. No email verification (no email delivery in the MVP).
- **Auth tables have no RLS.** Better Auth reads them before any user or org is known (sign-in by email, session by token). They hold no tenant data, and only `src/auth` queries them. This is the main point for the security review (section 6).
- **`users.email` has a lower-case `CHECK`**, so two spellings cannot become two users even if code bypasses Better Auth.

## 4. Tests executed

Windows, Node v24.14.0, pnpm 9.15.9, Docker 26.0.0, `postgres:16` (local, port 5433).

```powershell
# Drizzle upgrade alone, before any auth code
pnpm --filter @lathe/application-foundation add -E drizzle-orm@0.45.4
pnpm typecheck; pnpm lint; pnpm test; pnpm test:integration
# then
pnpm --filter @lathe/application-foundation add -E better-auth@1.7.26
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm format:check
pnpm audit --prod --audit-level low
# mutations: each edits src/auth/auth.ts, runs
#   pnpm --filter @lathe/application-foundation exec vitest run --config vitest.integration.config.ts src/auth
# and restores the file afterwards
```

## 5. Test results

| Command | Result | Exit |
|---|---|---|
| Drizzle 0.45.4 alone: `pnpm test` / `pnpm test:integration` | `Tests 76 passed` / `Tests 41 passed` | 0 |
| `pnpm typecheck` | all packages `Done` | 0 |
| `pnpm lint` | first run: `'parseUserId' is defined but never used` in the tenancy test (left over after replacing random user ids); removed; re-run clean | 1, then 0 |
| `pnpm test` | `Tests 76 passed (76)` | 0 |
| `pnpm test:integration` | `migrations applied: 0003_auth.sql` on first run; `Test Files 3 passed (3)`, `Tests 72 passed (72)` | 0 |
| `pnpm format:check` | clean | 0 |
| `pnpm audit --prod --audit-level low` | `No known vulnerabilities found` | 0 |

The 23 auth tests: short secret rejected; `BETTER_AUTH_TELEMETRY=true` refused; empty `trustedOrigins` rejected; seed lower-cases emails and creates memberships; password stored as a hash only; sign-up closed (400, no user row); sign-in sets a `Secure`, `HttpOnly`, `SameSite=Lax` cookie; `getPrincipal` returns the user and no active org; email accepted in any case; wrong password and unknown email give the same status and body; `update-session` and sign-in bodies cannot set `activeOrgId`; `getPrincipal` returns `null` with no cookie, a forged cookie, a changed signature, a token signed for another session, an expired session, and after sign-out (also when every sign-in cookie is replayed; the session row is deleted); sign-in and sign-out from an untrusted origin get 403 and the session stays valid; the 6th sign-in attempt in a minute gets 429, and so does the right password while limited; logs never contain the password, the secret or a session token; responses never contain the password or its hash.

Mutations (each restored afterwards):

| Mutation in `auth.ts` | Result |
|---|---|
| `disableOriginCheck: true` | 2 failed: both untrusted-origin tests |
| rate limit `enabled: false` | 1 failed: the 5-per-minute test |
| `disableSignUp: false` | 1 failed: sign-up closed by default |
| `activeOrgId` with `input: true` | first run: **0 failed**. Sign-in never accepts session fields, so the only test could not fail. Added a test that calls `/update-session`; re-run: 2 failed |
| cookie cache on (`maxAge: 300`) | first run: **0 failed**, because the tests replayed only the session-token cookie. The sign-out and expiry tests now replay every cookie from sign-in; re-run: 2 failed |

## 6. Remaining issues

- **Auth tables have no RLS and the app role has full DML on them.** Any code holding the app connection can read all users and all session tokens. Mitigations today: only `src/auth` uses them; the session cookie is signed. Stronger option for the security review: a separate database role used only by Better Auth, with no access to tenant tables, and the app role without access to `sessions` and `accounts`. Needs an infra change; not done here.
- **Session tokens are stored as issued** (Better Auth's default). Someone who can read the `sessions` table can use them, which is one more reason for the separate role above.
- **`x-forwarded-for` is the default IP header** and any client can set it, which would let one client spread its attempts across fake IPs. Each deployment must set `ipAddressHeaders` to the header its proxy writes (P10-01).
- **Seed command** not written: P1-07 (template app) owns the composition root that reads `LATHE_DEMO_PASSWORD` and calls `seedDemo()`.
- **No sign-in route in any app yet.** The handler is tested directly with `Request` objects. Mounting it under `/auth` is P1-07 (apps) and P3-04 (Engine).
- **Better Auth includes `@better-auth/telemetry`** as a dependency even with telemetry off. It is never called (guarded above). Not removable without forking.
- Not run on Node 22 locally; CI runs Node 22.

## 7. Dependencies or blockers

- Person A: confirm the two dependencies, and read the diff (security-critical; `src/auth/` is a CODEOWNERS path).
- Reviewers: `security` and `architect`.

## 8. Recommended next task

P1-04 organizations and memberships: create an org with its first owner, invite, accept, change role, remove, switch the active org (writes `sessions.active_org_id` after a `withUser` membership check), and keep the last owner from leaving.
