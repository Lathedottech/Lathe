/**
 * C4 Factory Engine HTTP API, version 1.
 *
 * Status: FROZEN, v1, 2026-11-17. Changes need a handoff request to `architect`.
 * Owner: architect.
 * Implemented by: `services/factory-engine/src/api` (task P3-04).
 * Consumed by: `apps/workspace` (tasks P9-02 to P9-06).
 *
 * Conventions (`.kiro/steering/engineering-standards.md`):
 *   - JSON over HTTP under `/v1`; run progress over Server-Sent Events;
 *   - one error shape `{ code, message, requestId }`;
 *   - lists are cursor-paginated.
 *
 * Security rules encoded here (`.kiro/steering/security.md`):
 *   - every route in `ROUTES` declares the permission it needs (deny by default);
 *   - request bodies are strict objects and never carry an org id, a role or a
 *     verification verdict: the active org comes from the authenticated membership;
 *   - a resource in another org is reported as `not_found`;
 *   - approvals bind to the sha256 of the content the human saw;
 *   - there is no merge, deploy or gate-override route;
 *   - a demo fault can only be requested on a demo run.
 */
import { z } from 'zod';
import { KiroEvent } from './kiro-adapter.js';
import { GateResult, VerificationReport } from './gates.js';
import {
  ApprovalId,
  FAULT_LABEL,
  FaultName,
  IsoDateTime,
  PlanId,
  PlanTaskKey,
  ProjectId,
  RepoRelativePath,
  RequestId,
  RunId,
  Sha256,
  Slug,
  SpecId,
  UserId,
} from './common.js';

export const API_PREFIX = '/v1' as const;

export const ErrorCode = z.enum([
  'bad_request',
  'validation_failed',
  'unauthenticated',
  /** Authenticated member of the org, but the role lacks the permission. */
  'forbidden',
  /** Does not exist, or belongs to another org. Indistinguishable on purpose. */
  'not_found',
  'conflict',
  /** The content changed after it was shown, so the approval was not recorded. */
  'stale_approval',
  'invalid_state_transition',
  'rate_limited',
  'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.strictObject({
  code: ErrorCode,
  message: z.string().max(1_000),
  requestId: RequestId,
});
export type ApiError = z.infer<typeof ApiError>;

/** Cursor-paginated list of `item`. `nextCursor` is null on the last page. */
export const Page = <T extends z.ZodType>(item: T) =>
  z.strictObject({ items: z.array(item), nextCursor: z.string().min(1).max(500).nullable() });

/** Run states (task P3-02). Only the Engine moves a run to AWAITING_APPROVAL or DELIVERED. */
export const RunState = z.enum([
  'DEFINED',
  'PLANNED',
  'BUILDING',
  'VERIFYING',
  'REPAIRING',
  'AWAITING_APPROVAL',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
]);
export type RunState = z.infer<typeof RunState>;

export const Project = z.strictObject({
  id: ProjectId,
  name: z.string().min(1).max(120),
  slug: Slug,
  /** The app folder Lathe builds into, for example `support-desk`. */
  targetApp: Slug,
  repository: z
    .strictObject({ owner: z.string().min(1).max(100), name: z.string().min(1).max(100) })
    .nullable(),
  createdAt: IsoDateTime,
});
export type Project = z.infer<typeof Project>;

export const SpecStatus = z.enum(['draft', 'submitted', 'approved', 'superseded']);
export const Spec = z.strictObject({
  id: SpecId,
  projectId: ProjectId,
  version: z.number().int().min(1),
  title: z.string().min(1).max(200),
  /** Markdown. Treated as data, never as instructions to the Engine. */
  body: z.string().min(1).max(100_000),
  contentSha256: Sha256,
  status: SpecStatus,
  createdAt: IsoDateTime,
});
export type Spec = z.infer<typeof Spec>;

export const PlanTask = z.strictObject({
  key: PlanTaskKey,
  title: z.string().min(1).max(200),
  /** Paths the task may change. The Engine rejects a patch outside them. */
  paths: z.array(RepoRelativePath).min(1),
  acceptanceChecks: z.array(z.string().min(1).max(500)).min(1),
  dependsOn: z.array(PlanTaskKey),
});
export type PlanTask = z.infer<typeof PlanTask>;

export const PlanStatus = z.enum(['proposed', 'approved', 'rejected', 'superseded']);
export const Plan = z
  .strictObject({
    id: PlanId,
    specId: SpecId,
    tasks: z.array(PlanTask).min(1).max(50),
    contentSha256: Sha256,
    status: PlanStatus,
    createdAt: IsoDateTime,
  })
  .superRefine((p, ctx) => {
    const keys = p.tasks.map((t) => t.key);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: 'custom', path: ['tasks'], message: 'task keys must be unique' });
    p.tasks.forEach((t, i) => {
      t.dependsOn.forEach((d, j) => {
        if (!keys.includes(d))
          ctx.addIssue({
            code: 'custom',
            path: ['tasks', i, 'dependsOn', j],
            message: `unknown task ${d}`,
          });
        if (d === t.key)
          ctx.addIssue({
            code: 'custom',
            path: ['tasks', i, 'dependsOn', j],
            message: 'a task cannot depend on itself',
          });
      });
    });
  });
export type Plan = z.infer<typeof Plan>;

export const Run = z
  .strictObject({
    id: RunId,
    projectId: ProjectId,
    specId: SpecId,
    planId: PlanId.nullable(),
    state: RunState,
    demo: z.boolean(),
    faultInjection: FaultName.nullable(),
    /** Repair attempts used so far. The limit is 3 (task P5-04). */
    repairAttempts: z.number().int().min(0).max(3),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  })
  .refine((r) => r.faultInjection === null || r.demo, {
    path: ['faultInjection'],
    message: 'fault injection is only allowed on demo runs',
  });
export type Run = z.infer<typeof Run>;

export const ApprovalSubject = z.enum(['spec', 'plan', 'delivery']);
export const Decision = z.enum(['approved', 'rejected']);
export const Approval = z.strictObject({
  id: ApprovalId,
  subjectType: ApprovalSubject,
  subjectId: z.uuid(),
  /** sha256 of the exact content the approver saw. */
  contentSha256: Sha256,
  decision: Decision,
  approverId: UserId,
  decidedAt: IsoDateTime,
});
export type Approval = z.infer<typeof Approval>;

export const EvidenceKind = z.enum([
  'state_change',
  'agent_event',
  'patch',
  'gate_result',
  'verification_report',
  'fault_injection',
  'approval',
  'delivery',
]);
export const EvidenceEntry = z
  .strictObject({
    runId: RunId,
    seq: z.number().int().min(0),
    kind: EvidenceKind,
    sha256: Sha256,
    /** Hash of the previous entry in this run's chain; null only for the first entry. */
    prevSha256: Sha256.nullable(),
    at: IsoDateTime,
    summary: z.string().max(500),
  })
  .refine((e) => (e.seq === 0) === (e.prevSha256 === null), {
    path: ['prevSha256'],
    message: 'only the first entry has no previous hash',
  });
export type EvidenceEntry = z.infer<typeof EvidenceEntry>;

export const Delivery = z.strictObject({
  runId: RunId,
  branch: z
    .string()
    .regex(/^lathe\/[a-z0-9-]+\/[a-f0-9-]{36}$/, 'expected lathe/<project>/<run-id>'),
  prNumber: z.number().int().min(1).nullable(),
  prUrl: z.url().nullable(),
  /** Lathe only opens draft pull requests. */
  draft: z.literal(true),
  checks: z.enum(['pending', 'passing', 'failing', 'unknown']),
  updatedAt: IsoDateTime,
});
export type Delivery = z.infer<typeof Delivery>;

/** Aggregates for the dashboard (task P9-03). Every number comes from Engine data. */
export const Overview = z.strictObject({
  activeProjects: z.number().int().min(0),
  runningRuns: z.number().int().min(0),
  pendingApprovals: z.number().int().min(0),
  verification: z.strictObject({
    passed: z.number().int().min(0),
    failed: z.number().int().min(0),
  }),
  recentRuns: z.array(Run).max(20),
});
export type Overview = z.infer<typeof Overview>;

export const CreateProjectRequest = z.strictObject({
  name: z.string().min(1).max(120),
  slug: Slug,
  targetApp: Slug,
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;

export const SubmitSpecRequest = z.strictObject({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(100_000),
});
export type SubmitSpecRequest = z.infer<typeof SubmitSpecRequest>;

export const CreateRunRequest = z
  .strictObject({
    specId: SpecId,
    demo: z.boolean(),
    faultInjection: FaultName.nullable(),
  })
  .refine((r) => r.faultInjection === null || r.demo, {
    path: ['faultInjection'],
    message: 'fault injection is only allowed on demo runs',
  });
export type CreateRunRequest = z.infer<typeof CreateRunRequest>;

/** Approve or reject content. `contentSha256` must match the current content or the Engine answers `stale_approval`. */
export const DecisionRequest = z.strictObject({
  decision: Decision,
  contentSha256: Sha256,
});
export type DecisionRequest = z.infer<typeof DecisionRequest>;

const eventBase = { runId: RunId, seq: z.number().int().min(0), at: IsoDateTime };

/** Server-Sent Events on `GET /v1/runs/:runId/events`. */
export const RunEvent = z.discriminatedUnion('type', [
  z.strictObject({
    ...eventBase,
    type: z.literal('state_changed'),
    from: RunState.nullable(),
    to: RunState,
  }),
  z.strictObject({ ...eventBase, type: z.literal('agent_event'), event: KiroEvent }),
  z.strictObject({
    ...eventBase,
    type: z.literal('gate_result'),
    attempt: z.number().int().min(0).max(3),
    result: GateResult,
  }),
  z.strictObject({ ...eventBase, type: z.literal('evidence_appended'), entry: EvidenceEntry }),
  z.strictObject({ ...eventBase, type: z.literal('approval_recorded'), approval: Approval }),
  z.strictObject({ ...eventBase, type: z.literal('delivery_updated'), delivery: Delivery }),
  z.strictObject({
    ...eventBase,
    type: z.literal('fault_injected'),
    name: FaultName,
    label: z.literal(FAULT_LABEL),
  }),
]);
export type RunEvent = z.infer<typeof RunEvent>;

export type HttpMethod = 'GET' | 'POST';

export interface RouteDef {
  readonly method: HttpMethod;
  /** Path template under `/v1` with `:param` segments. */
  readonly path: string;
  /** Permission the caller's role must grant in the active org. */
  readonly permission: string;
  readonly request: z.ZodType | null;
  /** Response body schema; for the SSE route, the schema of one event. */
  readonly response: z.ZodType;
  readonly sse?: true;
}

/** Every Engine route. A route that is not listed here does not exist. */
export const ROUTES = {
  getOverview: {
    method: 'GET',
    path: '/v1/overview',
    permission: 'overview.read',
    request: null,
    response: Overview,
  },
  listProjects: {
    method: 'GET',
    path: '/v1/projects',
    permission: 'projects.read',
    request: null,
    response: Page(Project),
  },
  createProject: {
    method: 'POST',
    path: '/v1/projects',
    permission: 'projects.create',
    request: CreateProjectRequest,
    response: Project,
  },
  getProject: {
    method: 'GET',
    path: '/v1/projects/:projectId',
    permission: 'projects.read',
    request: null,
    response: Project,
  },
  listSpecs: {
    method: 'GET',
    path: '/v1/projects/:projectId/specs',
    permission: 'specs.read',
    request: null,
    response: Page(Spec),
  },
  submitSpec: {
    method: 'POST',
    path: '/v1/projects/:projectId/specs',
    permission: 'specs.submit',
    request: SubmitSpecRequest,
    response: Spec,
  },
  decideSpec: {
    method: 'POST',
    path: '/v1/specs/:specId/decision',
    permission: 'specs.approve',
    request: DecisionRequest,
    response: Approval,
  },
  getPlan: {
    method: 'GET',
    path: '/v1/plans/:planId',
    permission: 'plans.read',
    request: null,
    response: Plan,
  },
  decidePlan: {
    method: 'POST',
    path: '/v1/plans/:planId/decision',
    permission: 'plans.approve',
    request: DecisionRequest,
    response: Approval,
  },
  listRuns: {
    method: 'GET',
    path: '/v1/projects/:projectId/runs',
    permission: 'runs.read',
    request: null,
    response: Page(Run),
  },
  createRun: {
    method: 'POST',
    path: '/v1/projects/:projectId/runs',
    permission: 'runs.create',
    request: CreateRunRequest,
    response: Run,
  },
  getRun: {
    method: 'GET',
    path: '/v1/runs/:runId',
    permission: 'runs.read',
    request: null,
    response: Run,
  },
  cancelRun: {
    method: 'POST',
    path: '/v1/runs/:runId/cancel',
    permission: 'runs.cancel',
    request: null,
    response: Run,
  },
  streamRunEvents: {
    method: 'GET',
    path: '/v1/runs/:runId/events',
    permission: 'runs.read',
    request: null,
    response: RunEvent,
    sse: true,
  },
  listEvidence: {
    method: 'GET',
    path: '/v1/runs/:runId/evidence',
    permission: 'evidence.read',
    request: null,
    response: Page(EvidenceEntry),
  },
  listVerificationReports: {
    method: 'GET',
    path: '/v1/runs/:runId/verification',
    permission: 'verification.read',
    request: null,
    response: z.array(VerificationReport),
  },
  getDelivery: {
    method: 'GET',
    path: '/v1/runs/:runId/delivery',
    permission: 'delivery.read',
    request: null,
    response: Delivery,
  },
  decideDelivery: {
    method: 'POST',
    path: '/v1/runs/:runId/delivery/decision',
    permission: 'delivery.approve',
    request: DecisionRequest,
    response: Approval,
  },
} as const satisfies Record<string, RouteDef>;
export type RouteName = keyof typeof ROUTES;
