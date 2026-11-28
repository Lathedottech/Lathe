# Handoff: architect (A) to frontend (B): Workspace and landing UI reference

- **From:** architect (person A)
- **To:** frontend (person B)
- **Blocked tasks:** none. Guidance for P9-01 (final), P9-02, P9-03, P9-04, P9-05, P9-06.
- **Deadline:** before each task starts; final visual pass before feature freeze (Dec 1).
- **Reference image:** `docs/design/reference/workspace-reference.webp` (landing page left, Workspace dashboard right).

## What is needed

Use the reference for the **look**: dark glass cards, violet glow, 3D brand icons, grid, spacing. It matches the P9-00 design system, so build it with the existing tokens and `components/ui/*`. Add tokens only in `tokens.css`, no ad-hoc colors.

Do **not** copy its **content** where it breaks product rules (`.kiro/steering/product.md`, `docs/design/landing-claims.md`):

| In the reference | Problem | Do instead |
|---|---|---|
| "+25%", "98% SLA", "+18%", "-12%", mini bar charts | Invented numbers. The Workspace shows only real Engine state. | Real counts from the Engine API, or remove. No trend arrows until history exists. |
| "production-ready applications" | Forbidden claim. | "verified applications" / "draft pull requests with evidence". |
| Footer: Pricing, Careers, Blog, Contact | Non-goals, pages do not exist. | GitHub, Docs, Architecture, Security, License. |
| "with Kiro, CLI, and Crew" in the hero | Crew is a dev-time tool only, not part of the product. | Product: "Kiro IDE and CLI". Crew only in the "Built with Kiro" section. |
| "Agents 4 Online" | Runtime agents exist only during a run. | "Agents in active runs: N" (real), or omit. |
| Nav "Solutions" | Not in our IA. | P9-02 nav: Overview, Projects, Specifications, Factory Runs, Agents, Verification, Deliveries, Settings. Apps (Support Desk, Team Operations) can be a section in Projects. |
| "Watch demo" | Only if the video exists. | Link the demo video after P10 recording, hide until then. |
| "Enterprise" under the org | Billing/plan is a non-goal. | Show the user's role in the org. |

## Ideas to make it stronger (proposed)

1. **Dashboard centered on a run (P9-03):** make the Factory Pipeline the hero panel. Show the latest run live: Spec, Plan (approved by), Build, Verify, Repair, Re-verify, Draft PR, each step with status, duration and the evidence hash. This is the product thesis on one screen.
2. **Make the caught bug the visual moment (P9-05):** a red gate card "Tenant-isolation bug **injected by Lathe**, caught by `tenant-isolation` gate" with the failing evidence, then a green card "Repaired, fresh verifier passed". The label "injected by Lathe" is mandatory (`security.md`).
3. **Honest empty states in the same style:** glass card, icon, one sentence, one action ("No runs yet. Start one from a specification.").
4. **Recent Activity = run events:** render real `run_events` and audit events (actor, action, time), not invented activity.
5. **Performance:** 3D icons as static, optimized images (WebP/AVIF, fixed size) on the landing page only. Keep the Workspace light: no heavy blur stacks in tables, respect `prefers-reduced-motion`.
6. **Accessibility:** keep WCAG AA contrast on glass surfaces (the P9-00 contrast test must cover any new token pairs), and visible focus rings on dark backgrounds.

## Acceptance

Each P9 task report states which parts of the reference were used and which were changed for the rules above. The landing claims test (P9-01) and the "no hard-coded colors" lint stay green.

## Acknowledgment

_B: acknowledge here and link the PRs that apply this._