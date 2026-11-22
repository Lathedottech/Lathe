# Fixtures

Planted defects each gate must catch. A gate is only done when its fixtures fail.

- Runner (P2-01): planted gates that fail, fail without findings, throw, or register under the wrong id live in `src/runner.test.ts`. The default registry is tested to never pass (`src/cli.test.ts`).
- Protected paths (P2-02): `src/gates/protected-paths.fixtures.ts`. Each `fail` fixture must produce its rule; each `pass` fixture must produce no finding. A bypass found in review gets a fixture first.
- RBAC (P2-05): `fixtures/rbac/fixture-app.ts` (matrix variants: over-permissive role, locked-out editor, mutate on deny, open without session) and `fixtures/rbac/route-sources.ts` (deny-by-default pass and fail sources).
- Later gates add theirs: static and tests (P2-03), tenant isolation (P2-04), RBAC (P2-05), properties (P2-06), security (P2-07).
