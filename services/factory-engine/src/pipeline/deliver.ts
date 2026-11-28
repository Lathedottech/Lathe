import { Patch } from '@lathe/shared-contracts';
import { z } from 'zod';
import type { ApprovalCheck } from '../approvals/index.js';
import {
  redactString,
  sha256Hex,
  type EvidenceEntry,
  type EvidenceLog,
} from '../evidence/index.js';
import type { EngineCapability } from '../orchestrator/capability.js';
import { RunStateError, transitionRun, type RunStore } from '../orchestrator/index.js';
import type { PatchSource } from './verify.js';
import type { SpecSource } from './plan.js';

/**
 * Delivery port (task P8-01). The Engine reaches GitHub only through this
 * interface. `integrations/github` implements it, and only the composition
 * root wires the two together. There is deliberately no merge, approve or
 * deploy operation here.
 */
export interface DeliveryPort {
  createDeliveryBranch(input: {
    readonly project: string;
    readonly runId: string;
    readonly baseCommit: string;
  }): Promise<{ readonly branch: string }>;
  commitPatch(input: {
    readonly branch: string;
    readonly baseCommit: string;
    readonly diff: string;
    readonly message: string;
    readonly evidenceFiles: readonly { readonly path: string; readonly content: string }[];
  }): Promise<{ readonly commitSha: string }>;
  openDraftPullRequest(input: {
    readonly branch: string;
    readonly title: string;
    readonly body: string;
  }): Promise<{ readonly number: number; readonly url: string }>;
}

/** Checks a human approval against current content (`InMemoryApprovals` or a durable equivalent). */
export interface DeliveryApprovals {
  check(subject: string, currentContent: unknown): ApprovalCheck;
}

/** The delivery approval is bound to the verification binding hash (P5-03). */
export const deliveryApprovalSubject = (runId: string): string => `delivery:${runId}`;

export interface DeliverStepDeps {
  readonly runs: RunStore;
  readonly evidence: EvidenceLog;
  readonly specs: SpecSource;
  readonly patches: PatchSource;
  readonly approvals: DeliveryApprovals;
  readonly delivery: DeliveryPort;
  readonly capability: EngineCapability;
  readonly baseCommit: string;
}

export type DeliverRefusalReason =
  | 'evidence_chain_invalid'
  | 'not_verified'
  | 'approval_missing'
  | 'approval_stale'
  | 'patch_hash_mismatch';
export type DeliverStepResult =
  | {
      readonly outcome: 'delivered';
      readonly prUrl: string;
      readonly prNumber: number;
      readonly branch: string;
    }
  | { readonly outcome: 'refused'; readonly reason: DeliverRefusalReason }
  | { readonly outcome: 'error'; readonly reason: 'delivery_failed' };

const VerifyResultPayload = z.object({
  overall: z.string(),
  bindingHash: z.string().regex(/^[a-f0-9]{64}$/),
  resultHash: z.string(),
  commit: z.string(),
  patchSha256: z.string().regex(/^[a-f0-9]{64}$/),
  harnessSha256: z.string(),
  policySha256: z.string(),
  faultInjection: z.looseObject({ name: z.string().optional() }).nullable().optional(),
});
const GatePayload = z.object({
  gate: z.string(),
  status: z.string(),
  summary: z.string().optional(),
  findingCount: z.number().optional(),
});
const BranchPayload = z.object({ branch: z.string() });
const PrPayload = z.object({
  prUrl: z.string(),
  prNumber: z.number(),
  bindingHash: z.string(),
});
const CommitPayload = z.object({ commitSha: z.string(), patchSha256: z.string() });

interface VerifiedFacts {
  readonly result: z.infer<typeof VerifyResultPayload>;
  readonly gates: readonly z.infer<typeof GatePayload>[];
}

/** The last `verify_result` and the `verify_gate` entries recorded just before it. */
function lastVerification(entries: readonly EvidenceEntry[]): VerifiedFacts | null {
  let buffer: z.infer<typeof GatePayload>[] = [];
  let found: VerifiedFacts | null = null;
  for (const entry of entries) {
    if (entry.kind === 'verify_gate') {
      const gate = GatePayload.safeParse(entry.payload);
      if (gate.success) buffer.push(gate.data);
    } else if (entry.kind === 'verify_result') {
      const result = VerifyResultPayload.safeParse(entry.payload);
      found = result.success ? { result: result.data, gates: buffer } : null;
      buffer = [];
    }
  }
  return found;
}

function lastPayload<T>(
  entries: readonly EvidenceEntry[],
  kind: string,
  schema: z.ZodType<T>,
): T | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.kind !== kind) continue;
    const parsed = schema.safeParse(entry.payload);
    return parsed.success ? parsed.data : null;
  }
  return null;
}

/** One line of untrusted text: no newlines, no markdown table or code syntax, bounded. */
function inline(text: string, max = 160): string {
  return redactString(text)
    .replace(/[\r\n\t|`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export interface PullRequestContent {
  readonly title: string;
  readonly body: string;
}

/**
 * Evidence summary for the PR. Contains only hashes, gate names and statuses,
 * short redacted summaries and approval metadata. No full logs, no tokens.
 */
export function buildPullRequestContent(input: {
  readonly runId: string;
  readonly specTitle: string;
  readonly targetApp: string;
  readonly baseCommit: string;
  readonly verified: VerifiedFacts;
  readonly patchSha256: string;
  readonly fileCount: number;
  readonly approver: string;
  readonly approvedAt: string;
}): PullRequestContent {
  const { result, gates } = input.verified;
  const injected = result.faultInjection ?? null;
  const lines: string[] = [
    `Draft PR opened by Lathe for run \`${input.runId}\`. A human must review and merge it.`,
    '',
    `- Spec: ${inline(input.specTitle, 120)} (app \`${inline(input.targetApp, 60)}\`)`,
    `- Base commit: \`${input.baseCommit}\``,
    `- Patch sha256: \`${input.patchSha256}\` (${String(input.fileCount)} file(s))`,
    `- Verification binding hash: \`${result.bindingHash}\``,
    `- Verification result hash: \`${inline(result.resultHash, 80)}\``,
    `- Harness sha256: \`${inline(result.harnessSha256, 80)}\``,
    `- Policy sha256: \`${inline(result.policySha256, 80)}\``,
    `- Delivery approved by \`${inline(input.approver, 80)}\` at ${inline(input.approvedAt, 40)}`,
  ];
  if (injected !== null)
    lines.push(
      '',
      `> **Fault injection: injected by Lathe** (${inline(injected.name ?? 'unnamed', 60)}). ` +
        'This run is a demo; the fault was planted deliberately and is labeled as such in the evidence.',
    );
  lines.push('', '| Gate | Status | Summary |', '| --- | --- | --- |');
  for (const g of gates)
    lines.push(`| ${inline(g.gate, 40)} | ${inline(g.status, 20)} | ${inline(g.summary ?? '')} |`);
  lines.push(
    '',
    'CI re-runs `lathe-verify` on this branch as an independent second check.',
    `Evidence: \`.lathe/evidence/${input.runId}/summary.json\`.`,
  );
  const title = `Lathe: ${inline(input.specTitle, 120) || 'delivery'} (${input.runId.slice(0, 8)})`;
  return { title, body: redactString(lines.join('\n')) };
}

/**
 * Deliver step (task P8-01). The run must be AWAITING_APPROVAL with a recorded
 * verification pass and a human delivery approval bound to that pass's binding
 * hash. The patch is re-hashed and must equal the verified patch. Then: branch,
 * commit, draft PR. Success -> DELIVERED (PR URL stored as evidence). Any
 * GitHub error leaves the run in AWAITING_APPROVAL with evidence, and a retry
 * resumes after the last completed API step. The Engine never merges.
 */
export async function runDeliverStep(
  deps: DeliverStepDeps,
  runId: string,
): Promise<DeliverStepResult> {
  const current = (await deps.runs.listNonTerminal()).find((r) => r.runId === runId);
  if (!current) throw new RunStateError('run_not_found', 'Run not found');
  if (current.state !== 'AWAITING_APPROVAL')
    throw new RunStateError(
      'invalid_run_state',
      `Deliver step needs AWAITING_APPROVAL, run is ${current.state}`,
    );

  const refuse = async (reason: DeliverRefusalReason): Promise<DeliverStepResult> => {
    await deps.evidence.append(runId, 'deliver_refused', { reason });
    return { outcome: 'refused', reason };
  };

  if (!(await deps.evidence.verify(runId)).ok) return refuse('evidence_chain_invalid');
  const entries = await deps.evidence.list(runId);
  const verified = lastVerification(entries);
  if (!verified || verified.result.overall !== 'passed') return refuse('not_verified');

  const approval = deps.approvals.check(
    deliveryApprovalSubject(runId),
    verified.result.bindingHash,
  );
  if (!approval.ok)
    return refuse(approval.reason === 'stale' ? 'approval_stale' : 'approval_missing');

  // Re-hash what would be delivered and compare it with what was verified.
  const stored = Patch.safeParse(await deps.patches.get(runId));
  if (
    !stored.success ||
    sha256Hex(stored.data.diff) !== stored.data.sha256 ||
    stored.data.sha256 !== verified.result.patchSha256 ||
    stored.data.baseCommit !== deps.baseCommit ||
    verified.result.commit !== deps.baseCommit
  )
    return refuse('patch_hash_mismatch');
  const patch = stored.data;

  const spec = await deps.specs.get(runId);
  const content = buildPullRequestContent({
    runId,
    specTitle: spec.title,
    targetApp: spec.targetApp,
    baseCommit: deps.baseCommit,
    verified,
    patchSha256: patch.sha256,
    fileCount: patch.files.length,
    approver: approval.approval.approver,
    approvedAt: approval.approval.approvedAt,
  });
  const summaryJson = JSON.stringify(
    {
      runId,
      baseCommit: deps.baseCommit,
      patchSha256: patch.sha256,
      bindingHash: verified.result.bindingHash,
      resultHash: verified.result.resultHash,
      harnessSha256: verified.result.harnessSha256,
      policySha256: verified.result.policySha256,
      faultInjection: verified.result.faultInjection ?? null,
      gates: verified.gates,
      approval: { approver: approval.approval.approver, at: approval.approval.approvedAt },
    },
    null,
    2,
  );

  try {
    // Resume after the last completed API step of an earlier failed attempt.
    let branch = lastPayload(entries, 'delivery_branch', BranchPayload)?.branch;
    if (branch === undefined) {
      branch = (
        await deps.delivery.createDeliveryBranch({
          project: spec.title,
          runId,
          baseCommit: deps.baseCommit,
        })
      ).branch;
      await deps.evidence.append(runId, 'delivery_branch', { branch });
    }
    const committed = lastPayload(entries, 'delivery_commit', CommitPayload);
    if (committed?.patchSha256 !== patch.sha256) {
      const { commitSha } = await deps.delivery.commitPatch({
        branch,
        baseCommit: deps.baseCommit,
        diff: patch.diff,
        message: `feat: ${inline(spec.title, 100)} (Lathe run ${runId.slice(0, 8)})`,
        evidenceFiles: [{ path: `.lathe/evidence/${runId}/summary.json`, content: summaryJson }],
      });
      await deps.evidence.append(runId, 'delivery_commit', {
        commitSha,
        patchSha256: patch.sha256,
      });
    }
    const opened = lastPayload(entries, 'delivery_pr', PrPayload);
    let pr: { readonly number: number; readonly url: string };
    if (opened?.bindingHash === verified.result.bindingHash) {
      pr = { number: opened.prNumber, url: opened.prUrl };
    } else {
      pr = await deps.delivery.openDraftPullRequest({
        branch,
        title: content.title,
        body: content.body,
      });
      await deps.evidence.append(runId, 'delivery_pr', {
        prUrl: pr.url,
        prNumber: pr.number,
        branch,
        draft: true,
        bindingHash: verified.result.bindingHash,
      });
    }
    await transitionRun(deps.runs, runId, 'DELIVERED', {
      capability: deps.capability,
      reason: 'draft_pr_opened',
    });
    return { outcome: 'delivered', prUrl: pr.url, prNumber: pr.number, branch };
  } catch (cause) {
    await deps.evidence.append(runId, 'delivery_error', {
      reason: 'delivery_failed',
      detail: redactString(cause instanceof Error ? `${cause.name}: ${cause.message}` : 'unknown')
        .replace(/[\r\n]+/g, ' ')
        .slice(0, 300),
    });
    return { outcome: 'error', reason: 'delivery_failed' };
  }
}
