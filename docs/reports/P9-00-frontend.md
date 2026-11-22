# P9-00 UX/UI design system and wireframes (frontend)

Person: B. Branch: `task/P9-00-design-system`, from `origin/main` at `6b0c390`. Date: 2026-11-21.

## 1. Objective completed

P9-00, **completed, pending architect review**. Wireframes for the landing page and every Workspace screen, the token set (dark industrial, controlled violet accent), 18 UI primitives, documentation, and three automated checks: WCAG AA contrast over token pairs, a raw-color ban outside `tokens.css`, and component behaviour and accessibility tests. This task also creates `apps/workspace` (Next.js), with an internal `/design-system` reference page.

Decision needed from person A: Next.js for `apps/workspace` (D8 is "recommended, ADR pending") and the new dependencies (section 3).

## 2. Files created or modified

New:
- `docs/design/wireframes.md`: landing page, Workspace shell, Overview, Projects and project workspace, live run, verification and delivery; desktop, tablet, mobile; the four states every screen implements; the C4 route behind each screen.
- `docs/design/design-system.md`: rules, token table, component table (use / don't use / accessibility), keyboard and focus, layouts, how to add a token or component.
- `apps/workspace/` (new package `@lathe/workspace`): `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`.
- `apps/workspace/src/styles/`: `tokens.css`, `base.css`, `contrast.ts`, `raw-colors.ts`, `contrast.test.ts`, `no-raw-colors.test.ts`.
- `apps/workspace/src/components/ui/`: `button`, `surface` (Card, Badge, Stat), `status-chip`, `table`, `form` (TextField, TextArea, Select, Checkbox), `tabs`, `nav` (SideNav, TopNav), `states` (EmptyState, LoadingState, ErrorState), `code-block` (CodeBlock, DiffBlock), each with a CSS Module; `cx.ts`; `index.ts`; `ui.test.tsx`.
- `apps/workspace/src/app/layout.tsx`, `src/app/design-system/page.tsx` + CSS Module; `src/types/css.d.ts`.

Modified: `pnpm-workspace.yaml` (adds `apps/workspace`), `vitest.config.ts` (workspace project), `.gitignore` and `.prettierignore` (`next-env.d.ts`, `.next`), `eslint.config.js` (ignores `next-env.d.ts`), `pnpm-lock.yaml`.

## 3. Technical decisions

- **Next.js 16.4.6 with React 19.3.1** for `apps/workspace` (D8, D17: one app with `(marketing)` and `(app)` route groups later). Rejected: a separate Vite app for the design system (would be thrown away when the Workspace starts).
- **Plain CSS custom properties and CSS Modules**, no UI library, no Tailwind. Tailwind is not in the approved stack table, and plain tokens make "only tokens" a simple text check. Rejected: Tailwind (utility classes carry raw scales), a component library (its own colors and focus styles to override).
- **Semantic tokens over palette tokens.** Components reference `--text-muted`, never `--color-gray-400`, so one palette change updates every use and the contrast test covers it.
- **Contrast checked against the real tokens file.** `contrast.ts` parses `tokens.css`, resolves `var()` chains and checks each pair in `PAIRS` (text 4.5:1, borders and focus 3:1). A second test fails if any `--text-*`, `--status-*`, `--diff-*`, `--action-*`, `--surface-*` or `--focus-*` token is missing from `PAIRS`.
- **Colors changed by the contrast test** on its first run (all three were my mistakes):
  - `--action-primary-hover` was lighter violet `#8466f0`: white on it was **3.75:1**. Now darker `#5a3ec9`.
  - `--border-strong` was `#3f3f49`: **1.90:1** on the page and **1.81:1** on cards, below the 3:1 needed for form-control borders. Now `#6e6e7a`.
  - Font sizes were named `--text-*` and collided with the text-color group; renamed to `--font-size-*`.
- **`StatusChip` is typed from contracts C3 and C4** (`RunState`, `GateStatus`, `OverallStatus`, type-only import from `@lathe/shared-contracts`), so a new Engine state fails typecheck until it has a label, tone and symbol.
- **Untrusted text is always text.** `CodeBlock` and `DiffBlock` render through JSX text nodes; no `dangerouslySetInnerHTML`. `CodeBlock` keeps the last 2000 lines.
- **Dependencies**, all pinned exactly: runtime `next` 16.4.6, `react` 19.3.1, `react-dom` 19.3.1, `@lathe/shared-contracts` (workspace); dev `@types/react` 19.3.0, `@types/react-dom` 19.3.0, `@types/node` 22.20.5, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `happy-dom` 21.0.4 (browser-like DOM for tests), `vitest` 5.1.0. `pnpm audit --prod`: no known vulnerabilities.
- **`/design-system` page** is internal (`robots: noindex`) and its sample content is labelled illustrative. It lets reviewers see every component and state in a browser.
- **`next-env.d.ts` is not committed**: Next.js regenerates it on every build and it imports files under `.next/`.
- **Tests compile JSX with the React runtime** (`oxc.jsx.runtime: automatic` in `vitest.config.ts`) while `tsconfig.json` keeps `jsx: preserve` for Next.js.

## 4. Tests executed

Windows, Node v24.14.0, pnpm 9.15.9.

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm audit --prod --audit-level low
$env:NEXT_TELEMETRY_DISABLED = '1'; pnpm --filter @lathe/workspace run build
# mutations: each edits one file, runs `pnpm exec vitest run` in apps/workspace, restores the file
```

## 5. Test results

| Command | Result | Exit |
|---|---|---|
| `pnpm install --frozen-lockfile` | ok | 0 |
| `pnpm typecheck` | all packages, including `@lathe/workspace` | 0 |
| `pnpm lint` | clean | 0 |
| `pnpm test` | `Test Files 12 passed (12)`, `Tests 147 passed (147)` (71 new in the workspace) | 0 |
| `pnpm format:check` | clean | 0 |
| `pnpm audit --prod --audit-level low` | `No known vulnerabilities found` | 0 |
| `next build` | first run failed typecheck (`exactOptionalPropertyTypes` in `form.tsx`), fixed; then `Compiled successfully`, route `/design-system` static | 1, then 0 |
| contrast test, first run | `Tests 4 failed \| 34 passed (38)`: the three color problems above and the naming collision; then 38 passed | 1, then 0 |

The 71 workspace tests: 2 contrast-helper tests, 35 token-pair tests, the coverage-of-pairs test, 2 raw-color tests (a planted sample is caught; the source tree is clean), and 31 component tests (Button default type and busy; TextField label, hint, error and `aria-invalid`; Tabs initial state, keyboard Left/Right/Home/End with wrap and focus, tab–panel linking; StatusChip label for all 13 states and distinct tones; Table headers, caption, empty state; CodeBlock and DiffBlock render HTML-like input as text, line truncation, diff line kinds and screen-reader labels; LoadingState and ErrorState roles and request id; Stat `—` for unknown; SideNav `aria-current` for nested paths and labels when collapsed).

Mutations (each restored; afterwards `failed=0 of 71`):

| Mutation | Result |
|---|---|
| `#6d4fe0` written directly in `button.module.css` | 1 failed: the source tree uses tokens only |
| `CodeBlock` renders its text with `dangerouslySetInnerHTML` | 1 failed: never creates elements from its text |
| Tabs ignore arrow keys | 1 failed: keyboard navigation |
| StatusChip without its text label | 13 failed: one per state |
| `--color-gray-400` darkened to `#55555f` | 4 failed: muted text on each surface |

Import check: the workspace imports only `@lathe/shared-contracts` (type-only), `next`, `react`, `@testing-library/*`, `vitest` and Node built-ins in tests, which matches `workspace-only-contracts` and `workspace-no-db` in P0-10. The P0-10 checker is not on `main` yet, so it was not run; it will cover this package once PR #12 merges.

## 6. Remaining issues

- **No Playwright or automated accessibility scan.** The task's acceptance lists component tests and the contrast test, which are done; a browser scan of real pages is P9-07.
- **Fonts**: `Inter` and `JetBrains Mono` are named first in the stacks but not loaded; the system fallbacks render. Loading them (`next/font`, self-hosted) can come with P9-01.
- **No icon set.** `SideNav` accepts an icon node; choosing icons is part of P9-02.
- **Menus, dialogs, toasts** are not in this task. They need focus trapping and restoration when added.
- **Mobile Workspace** is out of scope for the MVP (wireframes, section 2).
- Not run on Node 22 locally; CI runs Node 22. CI does not run `next build` yet; adding a build step is a small devops follow-up.

## 7. Dependencies or blockers

- Person A: approve Next.js for `apps/workspace` and the new dependencies (security-relevant: a web framework).
- Reviewer: `architect`.

## 8. Recommended next task

P9-02 Workspace shell once P3-04 (Engine API) exists; until then P9-01 landing page skeleton (static, no Engine calls), or P7-01 hierarchical scopes.
