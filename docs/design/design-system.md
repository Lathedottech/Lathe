# Lathe design system (P9-00)

Status: Proposed, 2026-11-21. Scope: `apps/workspace` only (landing page and Workspace, decision D18). Support Desk and Team Operations use the `templates/app-starter` UI and do not import from here.

Live reference: `pnpm --filter @lathe/workspace dev`, then open `/design-system`. Wireframes: [wireframes.md](wireframes.md).

## Rules

1. **Tokens only.** Every color, size and space comes from `apps/workspace/src/styles/tokens.css` through `var(--…)`. Raw colors anywhere else fail `src/styles/no-raw-colors.test.ts`.
2. **Use semantic tokens** (`--text-primary`, `--surface-raised`, `--status-danger-text`), not palette tokens (`--color-violet-600`). Palette tokens exist so semantic ones have one source.
3. **Components only.** Screens compose the primitives in `src/components/ui/`. A new visual pattern becomes a component with a test before a second screen uses it.
4. **Contrast is tested.** Every text and UI pair a component uses is listed in `src/styles/contrast.ts` (`PAIRS`) and must meet WCAG AA: 4.5:1 for text, 3:1 for borders and focus rings. A new semantic color token must appear in a pair, or the test fails.
5. **Color is never the only signal.** States carry a text label and a symbol; diff lines carry `+`/`-` and a screen-reader label.
6. **Untrusted text is text.** Agent output, logs, gate output, specs and diffs go through `CodeBlock`/`DiffBlock` or plain JSX text. `dangerouslySetInnerHTML` is not used in this app.
7. **No fake data.** Screens show real Engine data or an `EmptyState`/`LoadingState`/`ErrorState`. `Stat` shows `—` when a value is not loaded, never `0`.

## Identity

Dark industrial: black page, charcoal surfaces, white text, one violet accent used sparingly (the primary action, focus ring, active navigation, links).

| Token group | Tokens |
|---|---|
| Surfaces | `--surface-page` (black), `--surface-raised` (cards, sidebar), `--surface-sunken` (inputs, code), `--surface-hover`, `--surface-accent` (active nav) |
| Text | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-accent`, `--text-on-accent` |
| Borders | `--border-subtle` and `--border-default` (dividers only), `--border-strong` (form controls, 3:1), `--focus-ring` |
| Actions | `--action-primary`, `--action-primary-hover` (darker, keeps 4.5:1), `--action-secondary`, `--action-secondary-hover`, `--action-danger` |
| Status | `--status-{success,danger,warning,info,neutral}-{text,bg}` |
| Diff | `--diff-add-{bg,text}`, `--diff-remove-{bg,text}` |
| Type | `--font-sans`, `--font-mono`, `--font-size-{xs,sm,md,lg,xl,2xl,3xl}`, `--leading-*`, `--weight-*` |
| Space | `--space-1` … `--space-8` (4 px grid) |
| Layout | `--grid-columns` (12), `--grid-gutter`, `--content-max`, `--sidebar-width`, `--sidebar-collapsed`, `--topbar-height` |
| Shape | `--border-width`, `--radius-{sm,md,lg,pill}`, `--shadow-raised`, `--shadow-overlay` |
| Motion | `--duration-fast`, `--duration-normal`, `--easing`; both durations are `0ms` under `prefers-reduced-motion` |

## Components (`src/components/ui`)

| Component | Use for | Do not use for | Accessibility built in |
|---|---|---|---|
| `Button` (`primary`, `secondary`, `danger`, `ghost`; `sm`, `md`; `busy`) | actions | navigation (use a link) | `type="button"` by default; `busy` sets `disabled` and `aria-busy`. One `primary` per view |
| `Card` (`title`, `level`, `actions`) | grouping a section | layout spacing alone | with `title`: a `<section>` with a real heading level |
| `Badge` (`neutral`, `accent`) | static labels: a version, "draft" | run or gate states | text only |
| `StatusChip` (`status`) | every run state (C4 `RunState`) and gate result (C3 `GateStatus`, `OverallStatus`) | anything else | label + symbol, not color alone. Typed from the contracts, so a new state fails typecheck |
| `Stat` (`label`, `value`, `detail`) | dashboard numbers from `GET /v1/overview` | estimates | `null` renders `—`, never `0` |
| `Table` (`caption`, `columns`, `rows`, `rowKey`, `empty`) | lists of runs, projects, gates, evidence | layout | `<caption>`, `<th scope="col">`, scrollable region with a label; empty rows render `empty` instead |
| `TextField`, `TextArea`, `Select`, `Checkbox` | forms | — | visible label always; `hint` and `error` linked by `aria-describedby`; `error` sets `aria-invalid` and is announced |
| `Tabs` (`label`, `items`) | sections of one object (project: spec, plan, runs) | page navigation | WAI-ARIA tabs: Left/Right (wrapping), Home/End; only the selected tab is in the tab order |
| `SideNav`, `TopNav` | Workspace sidebar (P9-02); landing page header (P9-01) | — | `<nav>` with a label; `aria-current="page"` on the current item (nested paths too); collapsed keeps labels for screen readers |
| `EmptyState` | nothing to show yet, plus the action that creates it if allowed | sample data | text |
| `LoadingState` | waiting for data | fake progress | `role="status"`, `aria-live="polite"` |
| `ErrorState` | API errors: `message` and `requestId` | stack traces (the API never sends them) | `role="alert"` |
| `CodeBlock` | agent output, logs, gate output | trusted formatted content | rendered as text; keeps the last `maxLines` (2000) and says how many were dropped; focusable to scroll by keyboard |
| `DiffBlock` | patches from `GET /v1/runs/:runId/patches/:attempt` | — | rendered as text; added/removed lines have color, sign and a screen-reader label |

## Keyboard and focus

- Every interactive element is reachable with Tab, in reading order. No positive `tabindex`.
- Focus is always visible: a 2 px `--focus-ring` outline (`:focus-visible`), at least 3:1 against every surface.
- Scrollable regions (`CodeBlock`, `DiffBlock`, wide `Table`) are focusable, so they scroll with the keyboard.
- Tabs follow the WAI-ARIA tabs pattern (above). Menus and dialogs are not in this task; when added, they must trap and restore focus.

## Layouts

| Width | Landing page | Workspace |
|---|---|---|
| ≥ 1280 px (desktop) | full sections | sidebar open (`--sidebar-width`) |
| 768–1279 px (tablet) | sections stack where needed | sidebar collapsed to icons (`--sidebar-collapsed`) |
| < 768 px (mobile) | one column | not targeted in the MVP; P9-07 |

## Adding a token or component

1. Add the palette value and a semantic token in `tokens.css`.
2. Add every pair it is used in to `PAIRS` in `src/styles/contrast.ts`; run `pnpm --filter @lathe/workspace exec vitest run src/styles`.
3. Add a component in `src/components/ui/` with a CSS Module that uses only tokens, export it from `index.ts`, and test its behaviour and accessibility in `ui.test.tsx`.
4. Add it to `/design-system` and to the table above.
