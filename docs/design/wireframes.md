# Wireframes: landing page and Workspace (P9-00)

Status: Proposed, 2026-11-21. Low fidelity: layout, content and states only. Colors, type and components come from [design-system.md](design-system.md). Every screen shows only real Engine data (`.kiro/steering/architecture.md`); a screen without data shows an honest empty state, never sample numbers.

Data sources are routes of contract C4 v1.1 (`packages/shared-contracts/src/api.ts`).

Layouts: **desktop** 1280 px and wider (sidebar open), **tablet** 768 to 1279 px (sidebar collapses to icons), **mobile** under 768 px (landing page only for the MVP; the Workspace shows a "use a wider screen" notice under 768 px, P9-07 may improve it).

---

## 1. Landing page, route group `(marketing)`, P9-01

Static. No Engine call. Every claim maps to an artifact in `docs/design/landing-claims.md` (P9-01). No pricing.

```
┌──────────────────────────────────────────────────────────────────────┐
│ [logo] Lathe     Product  How it works  Architecture  GitHub  [Get started] │  NavBar
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Your Mini Software Factory                                         │  Hero
│   An agent writes the code. Lathe verifies it independently.        │
│   [Get started]  [View on GitHub]                                    │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  Define → Plan → Build → Test → Verify → Ship                        │  Workflow strip
│  (Ship = draft PR with evidence, a human approves)                   │  (6 steps, one line each)
├──────────────────────────────────────────────────────────────────────┤
│  Architecture overview (diagram from docs/architecture/)             │
├───────────────────┬───────────────────┬──────────────────────────────┤
│ Agentic           │ Verification      │ Execution governance         │  3 capability cards
│ development       │ harness           │                              │
├───────────────────┴───────────────────┴──────────────────────────────┤
│  Built with Lathe: [Support Desk card]  [Team Operations card]       │  real screenshots only
├──────────────────────────────────────────────────────────────────────┤
│  Kiro integration and the Kiroween 2026 story                        │
├──────────────────────────────────────────────────────────────────────┤
│  [Get started]                                                       │  Final call to action
├──────────────────────────────────────────────────────────────────────┤
│  GitHub · Docs · License                                             │  Footer
└──────────────────────────────────────────────────────────────────────┘
```

Mobile: sections stack in one column; the nav collapses to a menu button.
Cut ladder step 6 keeps only: hero, workflow, architecture, apps, Kiro story, footer.

---

## 2. Workspace shell, route group `(app)`, P9-02

Authenticated. Unauthenticated users are redirected to sign-in (server side).

```
┌────────────┬─────────────────────────────────────────────────────────┐
│ [logo]     │ Project: [Support Desk ▾]          [Org: Acme ▾] [user ▾]│  TopBar
│            ├─────────────────────────────────────────────────────────┤
│ Overview   │                                                         │
│ Projects   │                     page content                        │
│ Specs      │                                                         │
│ Runs       │                                                         │
│ Agents     │                                                         │
│ Verification│                                                        │
│ Deliveries │                                                         │
│ Settings   │                                                         │
└────────────┴─────────────────────────────────────────────────────────┘
  SideNav
```

- Org menu: memberships from `GET /v1/me`; switching calls `POST /v1/session/active-org` with a membership id.
- Actions the user cannot perform are hidden using `Me.permissions`; the Engine still enforces.
- Agents and Settings: honest empty states for the MVP (contract review R8). Agents lists `GET /v1/agents`.

---

## 3. Overview (dashboard), P9-03 — `GET /v1/overview`

```
┌────────────┬────────────┬────────────┬──────────────────────────────┐
│ Active     │ Running    │ Pending    │ Verification                 │  4 stat cards
│ projects 3 │ runs 1     │ approvals 2│ passed 12 · failed 3         │
├────────────┴────────────┴────────────┴──────────────────────────────┤
│ Recent runs                                           [New project]  │
│ ┌──────────┬───────────────┬──────────────┬──────────┬────────────┐ │
│ │ Run      │ Project       │ State        │ Repairs  │ Updated    │ │  Table
│ │ #a1b2    │ Support Desk  │ (VERIFYING)  │ 1 / 3    │ 2 min ago  │ │  State = StatusChip
│ └──────────┴───────────────┴──────────────┴──────────┴────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

Empty: "No projects yet" + [Create factory project]. Loading: skeleton rows. Error: error state with the `requestId`.

---

## 4. Projects list and project workspace, P9-04

List — `GET /v1/projects`: table (name, target app, repository, created). Row → project.

Project — `GET /v1/projects/:projectId` and its specs and runs:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Support Desk · target app support-desk · repo owner/name            │
│ [Overview] [Specification] [Plan] [Runs] [Evidence] [Delivery]       │  Tabs
├──────────────────────────────────────────────────────────────────────┤
│ Specification v3 (submitted)                     sha256 ab12…        │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ markdown body, rendered as text-safe markdown                     │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ [Approve spec]  [Reject]          approving: content sha256 ab12…    │  approval shows the hash
└──────────────────────────────────────────────────────────────────────┘
```

Plan tab — `GET /v1/plans/:planId`: one card per task (key, title, paths, acceptance checks, depends on). [Approve plan] shows the plan's sha256. A spec edited after approval shows "plan needs re-approval".

---

## 5. Live run, P9-05 — `GET /v1/runs/:runId` + SSE `GET /v1/runs/:runId/events`

```
┌──────────────────────────────────────────────────────────────────────┐
│ Run #a1b2 · Support Desk · (REPAIRING) · repair 1 of 3   [Cancel run]│
├──────────────────────────────────────────────────────────────────────┤
│ DEFINED ✓ → PLANNED ✓ → BUILDING ✓ → VERIFYING ✗ → REPAIRING ●      │  stage track
├───────────────────────────────────┬──────────────────────────────────┤
│ Agent activity                    │ Gates (attempt 1)                │
│ (agent_event stream, as text)     │ protected-paths   (passed)       │
│                                   │ static            (passed)       │
│                                   │ tests             (passed)       │
│                                   │ tenant-isolation  (failed)  ▸    │  ▸ opens findings
│                                   │ rbac              (not run)      │
├───────────────────────────────────┴──────────────────────────────────┤
│ ⚠ Fault injected by Lathe: drop-tenant-filter                        │  only on demo runs
└──────────────────────────────────────────────────────────────────────┘
```

Agent and log output is untrusted: rendered as plain text in a CodeBlock, never as HTML. Reconnect resumes with `?after=<seq>` (contract R4).

---

## 6. Verification and delivery, P9-06

Verification — `GET /v1/runs/:runId/verification`: one report per attempt; gate table with StatusChip; findings list; result hash; evidence chain from `GET /v1/runs/:runId/evidence` (seq, kind, sha256, previous sha256).

Diff — `GET /v1/runs/:runId/patches/:attempt`: DiffBlock, plain text, line colors from tokens.

Delivery — `GET /v1/runs/:runId/delivery`: branch, draft PR link, checks status. `null` → "Delivery has not started". [Approve delivery] shows the content hash. **No merge or deploy button**: merging happens on GitHub.

---

## States every screen implements

| State | Component | Content |
|---|---|---|
| Loading | `LoadingState` (or skeleton rows in a Table) | no fake numbers |
| Empty | `EmptyState` | what is missing and, if allowed, the action that creates it |
| Error | `ErrorState` | the error `message` and `requestId` from the API error shape |
| Forbidden | `ErrorState` | "You don't have access", never a list of what exists |
