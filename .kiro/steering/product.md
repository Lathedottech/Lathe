---
inclusion: always
---

# Product

## Vision
Lathe is a **Mini Software Factory**: it builds, tests, verifies and delivers multi-tenant applications using AI coding agents (Kiro) and deterministic engineering gates. It is a production system for software, not an AI assistant and not a dashboard that displays agents.

**Thesis to prove:** an agent writes code, Lathe verifies it independently, and the agent cannot certify its own work.

## Workflow
`DEFINE → PLAN → BUILD → TEST → VERIFY → DELIVER`

| Step | Done by | Human gate |
|---|---|---|
| DEFINE | Human writes a spec | Spec submitted |
| PLAN | Planner agent drafts a task plan; Engine validates its schema | Human approves plan |
| BUILD | Builder agent in a sandbox produces a diff | none |
| TEST, VERIFY | Deterministic gates in a fresh verifier container; repair agent on failure (bounded) | none; only the Engine records a pass |
| DELIVER | Engine opens a **draft** PR with evidence | Human approves and merges |

## Core capabilities
Factory Engine (runs, state machine, evidence, approvals) · Kiro adapter + sandbox · Verification harness · Reusable multi-tenant skeleton (auth, orgs, RBAC, tenant isolation via RLS, audit) · GitHub draft-PR delivery · Lathe Workspace (operator UI).

## MVP scope (Kiroween 2026, Skeleton Crew; deadline Dec 4, 2026 2:00 PM PST; feature freeze Dec 1)
- The Skeleton (`packages/application-foundation` plus `templates/app-starter`) and two distinct apps built from it: `apps/support-desk/` and `apps/team-operations/`.
- Lathe builds and repairs a **bounded module** inside an app (Support Desk Knowledge Base is the demo module).
- A public landing page and an authenticated Workspace with a dashboard, built on one design system. Both show only real, existing capabilities.
- Success criterion is the demo task P5-07: spec → plan → build → independent verification catches a labeled injected tenant-isolation bug → repair from failure evidence → fresh re-verification → draft PR with evidence → human approval.
- Source of truth for tasks and dates: `TASKLIST.md`, `IMPLEMENTATION_PLAN.md`.

## Non-goals (MVP)
- Generating whole apps from scratch.
- Auto-merge, auto-deploy, or any production deployment by agents.
- Spec-agent, review-agent, GitHub App and webhooks, SAST, gVisor, observability stack, multi-engine support (backlog: `docs/backlog/`).
- Publicly hosting the Engine (it runs Docker and Kiro on a trusted machine).
- Custom cryptography or a home-grown auth library.
- Billing, SSO administration, email delivery.

## Status vocabulary
Existing, Partial, Missing, Proposed. Never describe Proposed work as done.
