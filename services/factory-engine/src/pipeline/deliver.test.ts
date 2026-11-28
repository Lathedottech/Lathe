import type { Patch } from '@lathe/shared-contracts';
import { describe, expect, it } from 'vitest';
import { InMemoryApprovals } from '../approvals/index.js';
import type { SpecDocument } from '../domain/spec.js';
import { InMemoryEvidenceLog, sha256Hex } from '../evidence/index.js';
import { issueEngineCapability } from '../orchestrator/capability.js';
import { MemoryRunStore } from '../orchestrator/memory-run-store.js';
import { RunStateError } from '../orchestrator/index.js';
import {
  bindingHash,
  deliveryApprovalSubject,
  runDeliverStep,
  type DeliverStepDeps,
  type DeliveryPort,
} from './index.js';

const RUN = '11111111-1111-4111-8111-111111111111';
const BASE = 'a'.repeat(40);
const HARNESS = 'c'.repeat(64);
const POLICY = 'd'.repeat(64);
const TOKEN = 'github_pat_TESTTOKEN_0123456789abcdef';
const clock = { now: () => new Date('2026-12-01T00:00:00Z') };

const spec: SpecDocument = {
  title: 'Knowledge base',
  targetApp: 'support-desk',
  requirements: [{ id: 'R1', text: 'Agents can create articles' }],
  targetPaths: ['apps/support-desk/src/kb'],
  acceptanceChecks: [{ id: 'A1', requirement: 'R1', text: 'create returns the article' }],
};

const file = 'apps/support-desk/src/kb/create.ts';
const diff = `diff --git a/${file} b/${file}\nnew file mode 100644\nindex 0000000..1111111\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1 @@\n+export const x = 1;\n`;
const PATCH = { baseCommit: BASE, diff, files: [file], sha256: sha256Hex(diff) } as Patch;
const BINDING = bindingHash({
  commit: BASE,
  patchSha256: PATCH.sha256,
  harnessSha256: HARNESS,
  policySha256: POLICY,
});

async function setup(
  opts: {
    approve?: 'none' | 'bound' | 'stale';
    patch?: Patch;
    overall?: string;
    fault?: { name: string } | null;
    state?: 'AWAITING_APPROVAL' | 'VERIFYING';
    failOn?: 'branch' | 'commit' | 'pr';
    failTimes?: number;
  } = {},
) {
  const runs = new MemoryRunStore([
    { runId: RUN, state: opts.state ?? 'AWAITING_APPROVAL', repairAttempts: 0 },
  ]);
  const evidence = new InMemoryEvidenceLog(clock);
  await evidence.append(RUN, 'verify_gate', {
    gate: 'tenant-isolation',
    status: 'passed',
    summary: 'no cross-tenant reads',
    findingCount: 0,
  });
  await evidence.append(RUN, 'verify_result', {
    overall: opts.overall ?? 'passed',
    bindingHash: BINDING,
    resultHash: 'e'.repeat(64),
    commit: BASE,
    patchSha256: PATCH.sha256,
    harnessSha256: HARNESS,
    policySha256: POLICY,
    faultInjection: opts.fault ?? null,
  });
  const approvals = new InMemoryApprovals(clock);
  if (opts.approve !== 'none')
    approvals.approve(
      deliveryApprovalSubject(RUN),
      'user-human-1',
      opts.approve === 'stale' ? 'f'.repeat(64) : BINDING,
    );
  const calls: string[] = [];
  const sent: unknown[] = [];
  let failures = opts.failTimes ?? 1;
  const maybeFail = (step: 'branch' | 'commit' | 'pr') => {
    if (opts.failOn === step && failures > 0) {
      failures--;
      throw new Error(`HTTP 500 for ${step} with token ${TOKEN}`);
    }
  };
  const delivery: DeliveryPort = {
    createDeliveryBranch: (i) => {
      calls.push('branch');
      sent.push(i);
      maybeFail('branch');
      return Promise.resolve({ branch: `lathe/knowledge-base/${i.runId}` });
    },
    commitPatch: (i) => {
      calls.push('commit');
      sent.push(i);
      maybeFail('commit');
      return Promise.resolve({ commitSha: '9'.repeat(40) });
    },
    openDraftPullRequest: (i) => {
      calls.push('pr');
      sent.push(i);
      maybeFail('pr');
      return Promise.resolve({ number: 12, url: 'https://github.com/acme/lathe-demo/pull/12' });
    },
  };
  const deps: DeliverStepDeps = {
    runs,
    evidence,
    approvals,
    delivery,
    capability: issueEngineCapability(),
    baseCommit: BASE,
    specs: { get: () => Promise.resolve(spec) },
    patches: { get: () => Promise.resolve(opts.patch ?? PATCH) },
  };
  const state = async () =>
    (await runs.listNonTerminal()).find((r) => r.runId === RUN)?.state ?? 'DELIVERED';
  return { deps, calls, sent, evidence, state, approvals };
}

describe('runDeliverStep', () => {
  it('delivers: draft PR, PR URL in evidence, run DELIVERED', async () => {
    const t = await setup();
    const r = await runDeliverStep(t.deps, RUN);
    expect(r).toMatchObject({ outcome: 'delivered', prNumber: 12 });
    expect(t.calls).toEqual(['branch', 'commit', 'pr']);
    expect(await t.state()).toBe('DELIVERED');
    const entries = await t.evidence.list(RUN);
    expect(entries.find((e) => e.kind === 'delivery_pr')?.payload).toMatchObject({
      prUrl: 'https://github.com/acme/lathe-demo/pull/12',
      draft: true,
    });
    expect((await t.evidence.verify(RUN)).ok).toBe(true);
  });

  it('PR body has the binding hash, patch hash, gates and approval, and no token', async () => {
    const t = await setup();
    await runDeliverStep(t.deps, RUN);
    const pr = t.sent[2] as { title: string; body: string };
    expect(pr.body).toContain(BINDING);
    expect(pr.body).toContain(PATCH.sha256);
    expect(pr.body).toContain('tenant-isolation');
    expect(pr.body).toContain('user-human-1');
    expect(pr.body).not.toContain('injected by Lathe');
    expect(JSON.stringify(t.sent)).not.toContain(TOKEN);
    const commit = t.sent[1] as { evidenceFiles: { path: string; content: string }[] };
    expect(commit.evidenceFiles[0]?.path).toBe(`.lathe/evidence/${RUN}/summary.json`);
    expect(commit.evidenceFiles[0]?.content).toContain(BINDING);
  });

  it('labels an injected fault as "injected by Lathe"', async () => {
    const t = await setup({ fault: { name: 'missing-org-filter' } });
    await runDeliverStep(t.deps, RUN);
    const pr = t.sent[2] as { body: string };
    expect(pr.body).toContain('injected by Lathe');
    expect(pr.body).toContain('missing-org-filter');
  });

  it('redacts a secret that appears in a gate summary', async () => {
    const t = await setup();
    await t.evidence.append(RUN, 'verify_gate', {
      gate: 'secret-scan',
      status: 'passed',
      summary: `found ${TOKEN}`,
    });
    // Re-record a result so the gate above belongs to the last verification.
    await t.evidence.append(RUN, 'verify_result', {
      overall: 'passed',
      bindingHash: BINDING,
      resultHash: 'e'.repeat(64),
      commit: BASE,
      patchSha256: PATCH.sha256,
      harnessSha256: HARNESS,
      policySha256: POLICY,
      faultInjection: null,
    });
    await runDeliverStep(t.deps, RUN);
    expect(JSON.stringify(t.sent[2])).not.toContain(TOKEN);
  });

  it('refuses without a delivery approval, with no GitHub call', async () => {
    const t = await setup({ approve: 'none' });
    expect(await runDeliverStep(t.deps, RUN)).toEqual({
      outcome: 'refused',
      reason: 'approval_missing',
    });
    expect(t.calls).toEqual([]);
    expect(await t.state()).toBe('AWAITING_APPROVAL');
  });

  it('refuses a stale approval (bound to other content), with no GitHub call', async () => {
    const t = await setup({ approve: 'stale' });
    expect(await runDeliverStep(t.deps, RUN)).toEqual({
      outcome: 'refused',
      reason: 'approval_stale',
    });
    expect(t.calls).toEqual([]);
  });

  it('refuses when the patch differs from the verified one', async () => {
    const other = `${diff}+export const y = 2;\n`;
    const tampered = { ...PATCH, diff: other, sha256: sha256Hex(other) } as Patch;
    const t = await setup({ patch: tampered });
    expect(await runDeliverStep(t.deps, RUN)).toEqual({
      outcome: 'refused',
      reason: 'patch_hash_mismatch',
    });
    expect(t.calls).toEqual([]);
  });

  it('refuses when the stored diff no longer matches its own hash', async () => {
    const t = await setup({ patch: { ...PATCH, diff: `${diff}\n+x\n` } as Patch });
    expect(await runDeliverStep(t.deps, RUN)).toMatchObject({ reason: 'patch_hash_mismatch' });
    expect(t.calls).toEqual([]);
  });

  it('refuses when the recorded verification did not pass', async () => {
    const t = await setup({ overall: 'failed' });
    expect(await runDeliverStep(t.deps, RUN)).toEqual({
      outcome: 'refused',
      reason: 'not_verified',
    });
    expect(t.calls).toEqual([]);
  });

  it('refuses when there is no verification evidence at all', async () => {
    const t = await setup();
    const empty = { ...t.deps, evidence: new InMemoryEvidenceLog(clock) };
    expect(await runDeliverStep(empty, RUN)).toMatchObject({ reason: 'not_verified' });
    expect(t.calls).toEqual([]);
  });

  it('throws for a run that is not AWAITING_APPROVAL', async () => {
    const t = await setup({ state: 'VERIFYING' });
    await expect(runDeliverStep(t.deps, RUN)).rejects.toBeInstanceOf(RunStateError);
    expect(t.calls).toEqual([]);
  });

  for (const step of ['branch', 'commit', 'pr'] as const)
    it(`API error at ${step}: not DELIVERED, evidence without the token`, async () => {
      const t = await setup({ failOn: step });
      expect(await runDeliverStep(t.deps, RUN)).toEqual({
        outcome: 'error',
        reason: 'delivery_failed',
      });
      expect(await t.state()).toBe('AWAITING_APPROVAL');
      const entries = await t.evidence.list(RUN);
      expect(entries.some((e) => e.kind === 'delivery_error')).toBe(true);
      expect(JSON.stringify(entries)).not.toContain(TOKEN);
    });

  it('retry resumes after the last completed step and then delivers', async () => {
    const t = await setup({ failOn: 'pr' });
    await runDeliverStep(t.deps, RUN);
    expect(t.calls).toEqual(['branch', 'commit', 'pr']);
    const r = await runDeliverStep(t.deps, RUN);
    expect(r.outcome).toBe('delivered');
    expect(t.calls).toEqual(['branch', 'commit', 'pr', 'pr']);
    expect(await t.state()).toBe('DELIVERED');
  });

  it('a second delivery of a delivered run is rejected', async () => {
    const t = await setup();
    await runDeliverStep(t.deps, RUN);
    await expect(runDeliverStep(t.deps, RUN)).rejects.toBeInstanceOf(RunStateError);
  });
});
