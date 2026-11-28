import {
  GATE_ORDER,
  VERIFY_EXIT_CODES,
  type GateResult,
  type KiroAdapter,
  type KiroSession,
  type Patch,
  type SandboxHandle,
  type SessionRequest,
  type VerificationReport,
} from '@lathe/shared-contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { SpecDocument } from '../domain/spec.js';
import { InMemoryEvidenceLog, sha256Hex } from '../evidence/index.js';
import { issueEngineCapability } from '../orchestrator/capability.js';
import { MemoryRunStore } from '../orchestrator/memory-run-store.js';
import { RunStateError } from '../orchestrator/index.js';
import {
  failureFingerprint,
  runRepairLoop,
  runRepairStep,
  type RepairLoopDeps,
  type VerifierHandle,
} from './index.js';

const RUN = '11111111-1111-4111-8111-111111111111';
const BASE = 'a'.repeat(40);
const clock = { now: () => new Date('2026-12-01T00:00:00Z') };
const IMAGE = `lathe/sandbox@sha256:${'b'.repeat(64)}`;
const FAIL_AT = 3;

const spec: SpecDocument = {
  title: 'Knowledge base',
  targetApp: 'support-desk',
  requirements: [{ id: 'R1', text: 'Agents can create articles' }],
  targetPaths: ['apps/support-desk/src/kb'],
  acceptanceChecks: [{ id: 'A1', requirement: 'R1', text: 'create returns the article' }],
};

function patchOf(file: string, n: number): Patch {
  const diff = `diff --git a/${file} b/${file}\nnew file mode 100644\nindex 0000000..1111111\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1 @@\n+export const x = ${String(n)};\n`;
  return { baseCommit: BASE, diff, files: [file], sha256: sha256Hex(diff) } as Patch;
}
const OK_FILE = 'apps/support-desk/src/kb/create.ts';
const HARNESS_FILE = 'packages/verification-harness/src/gates.ts';

function gate(g: GateResult['gate'], i: number, failMessage: string | null): GateResult {
  if (failMessage === null || i < FAIL_AT)
    return {
      gate: g,
      status: 'passed',
      durationMs: 5,
      summary: 'PASSING_GATE_OUTPUT',
      findings: [],
      artifacts: [],
    };
  if (i === FAIL_AT)
    return {
      gate: g,
      status: 'failed',
      durationMs: 9,
      summary: 'cross-tenant read',
      findings: [{ ruleId: 'tenant/read', message: failMessage, severity: 'critical' }],
      artifacts: [],
    };
  return { gate: g, status: 'not_run', durationMs: 0, summary: '', findings: [], artifacts: [] };
}
function report(failMessage: string | null): VerificationReport {
  return {
    schemaVersion: 1,
    app: 'support-desk',
    commit: BASE,
    harnessSha256: 'c'.repeat(64),
    policySha256: 'd'.repeat(64),
    resultHash: 'e'.repeat(64),
    startedAt: '2026-12-01T00:00:00.000Z',
    finishedAt: '2026-12-01T00:00:01.000Z',
    overall: failMessage === null ? 'passed' : 'failed',
    gates: GATE_ORDER.map((g, i) => gate(g, i, failMessage)),
    faultInjection: null,
  } as VerificationReport;
}

/** verifyScript(n): null = pass, string = failure message of the n-th verification. */
type RepairMode = 'ok' | 'harness' | 'throw';
function setup(opts: {
  verifyScript: (n: number) => string | null;
  repairMode?: (n: number) => RepairMode;
}) {
  const runs = new MemoryRunStore([{ runId: RUN, state: 'VERIFYING', repairAttempts: 0 }]);
  const evidence = new InMemoryEvidenceLog(clock);
  const prompts: SessionRequest[] = [];
  const created: Array<{ id: string; prior: Patch | undefined; purpose: string }> = [];
  const destroyed: string[] = [];
  const verifiers: string[] = [];
  const saved: Patch[] = [];
  let current: Patch = patchOf(OK_FILE, 0);
  let verifies = 0;
  let starts = 0;

  const adapter: KiroAdapter = {
    start(request) {
      starts++;
      prompts.push(request);
      const session: KiroSession = {
        id: `s${String(starts)}` as KiroSession['id'],
        async *events() {
          /* no events */
        },
        prompt: () => Promise.resolve({ stopReason: 'end_turn', eventCount: 0 }),
        cancel: () => Promise.resolve(),
        close: () => Promise.resolve(),
      };
      return Promise.resolve(session);
    },
  };
  const deps: RepairLoopDeps = {
    repair: {
      runs,
      evidence,
      adapter,
      capability: issueEngineCapability(),
      baseCommit: BASE as RepairLoopDeps['repair']['baseCommit'],
      timeoutMs: 1_000,
      sandboxConfig: { image: IMAGE, egressAllowlist: [], allowCommands: false },
      specs: { get: () => Promise.resolve(spec) },
      patches: {
        get: () => Promise.resolve(current),
        save: (_r, p) => {
          current = p;
          saved.push(p);
          return Promise.resolve();
        },
      },
      sandboxes: {
        create: (sandboxSpec, ctx) => {
          const index = created.length;
          created.push({
            id: `sb${String(index)}`,
            prior: ctx.priorPatch,
            purpose: sandboxSpec.purpose,
          });
          const handle: SandboxHandle = {
            id: `sb${String(index)}`,
            spec: sandboxSpec,
            collectPatch: () => {
              const mode = opts.repairMode?.(index) ?? 'ok';
              if (mode === 'throw') return Promise.reject(new Error('collect failed'));
              return Promise.resolve(
                mode === 'harness' ? patchOf(HARNESS_FILE, index + 1) : patchOf(OK_FILE, index + 1),
              );
            },
            destroy: () => {
              destroyed.push(`sb${String(index)}`);
              return Promise.resolve();
            },
          };
          return Promise.resolve(handle);
        },
      },
    },
    verify: {
      runs,
      evidence,
      capability: issueEngineCapability(),
      baseCommit: BASE as RepairLoopDeps['verify']['baseCommit'],
      timeoutMs: 1_000,
      sandboxConfig: { image: IMAGE },
      specs: { get: () => Promise.resolve(spec) },
      patches: { get: () => Promise.resolve(current) },
      sandboxes: {
        liveAgentSandboxes: () => Promise.resolve([]),
        create: (sandboxSpec) => {
          const id = `v${String(verifiers.length)}`;
          verifiers.push(id);
          let text: string | null = null;
          const handle: VerifierHandle = {
            id,
            spec: sandboxSpec,
            collectPatch: () => Promise.reject(new Error('not for verifier')),
            destroy: () => Promise.resolve(),
            startEphemeralPostgres: () => Promise.resolve(),
            exec: () => {
              const message = opts.verifyScript(verifies++);
              text = JSON.stringify(report(message));
              return Promise.resolve({
                exitCode: message === null ? VERIFY_EXIT_CODES.passed : VERIFY_EXIT_CODES.failed,
                stdout: '',
                stderr: 'HARNESS_MARKER harness source',
                timedOut: false,
              });
            },
            readFile: () => Promise.resolve(text),
          };
          return Promise.resolve(handle);
        },
      },
    },
  };
  return {
    runs,
    evidence,
    deps,
    prompts,
    created,
    destroyed,
    verifiers,
    saved,
    current: () => current,
  };
}
const stateOf = async (runs: MemoryRunStore) =>
  (await runs.listNonTerminal()).find((r) => r.runId === RUN)?.state;
const stateOrFailed = async (runs: MemoryRunStore) => (await stateOf(runs)) ?? 'FAILED';
const kinds = async (t: ReturnType<typeof setup>) =>
  (await t.evidence.list(RUN)).map((e) => e.kind);

describe('runRepairLoop', () => {
  it('fixes on attempt 1, is re-verified in a fresh verifier and passes', async () => {
    const t = setup({ verifyScript: (n) => (n === 0 ? 'org B read org A row' : null) });
    expect(await runRepairLoop(t.deps, RUN)).toBe('passed');
    expect(await stateOf(t.runs)).toBe('AWAITING_APPROVAL');
    expect(t.created).toHaveLength(1);
    expect(t.verifiers).toHaveLength(2);
    expect(t.saved).toHaveLength(1);
    expect(t.created[0]?.prior?.sha256).toBe(patchOf(OK_FILE, 0).sha256);
    expect(t.prompts[0]?.agentProfile).toBe('repair');
    expect(t.prompts[0]?.mcpServers).toEqual([]);
  });

  it('never fixes, failures change: stops at exactly 3 attempts with repair_exhausted', async () => {
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    const t = setup({ verifyScript: (n) => `failure kind ${words[n] ?? 'zulu'}` });
    expect(await runRepairLoop(t.deps, RUN)).toBe('failed');
    expect(await stateOrFailed(t.runs)).toBe('FAILED');
    expect(t.created).toHaveLength(3);
    expect(t.verifiers).toHaveLength(4);
    const e = await t.evidence.list(RUN);
    expect(
      e.filter(
        (x) =>
          x.kind === 'repair_attempt' && (x.payload as { outcome: string }).outcome === 'started',
      ),
    ).toHaveLength(3);
    expect(e.some((x) => x.kind === 'repair_exhausted')).toBe(true);
    expect(e.some((x) => x.kind === 'repair_escalated')).toBe(false);
  });

  it('same failure twice escalates after 2 verifications, recording both fingerprints', async () => {
    const t = setup({ verifyScript: () => 'org B read org A row 123' });
    expect(await runRepairLoop(t.deps, RUN)).toBe('failed');
    expect(await stateOrFailed(t.runs)).toBe('FAILED');
    expect(t.created).toHaveLength(1);
    expect(t.verifiers).toHaveLength(2);
    const esc = (await t.evidence.list(RUN)).find((x) => x.kind === 'repair_escalated');
    const p = esc?.payload as {
      previousFingerprint: string;
      fingerprint: string;
      escalatedTo: string;
    };
    expect(p.previousFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(p.fingerprint).toBe(p.previousFingerprint);
    expect(p.escalatedTo).toBe('human');
    expect(await kinds(t)).not.toContain('repair_exhausted');
  });

  it('the repair agent sees only the latest failing gate output and the patch', async () => {
    const t = setup({
      verifyScript: (n) => (n === 0 ? 'first failure uno' : n === 1 ? 'second failure dos' : null),
    });
    await t.evidence.append(RUN, 'plan_note', { text: 'OTHER_EVIDENCE_MARKER' });
    await runRepairLoop(t.deps, RUN);
    expect(t.prompts).toHaveLength(2);
    const [a, b] = t.prompts.map((p) => p.prompt);
    expect(a).toContain('first failure uno');
    expect(a).toContain('=====LATHE-FAILURE-DATA=====');
    expect(a).toContain(OK_FILE);
    expect(b).toContain('second failure dos');
    expect(b).not.toContain('first failure uno');
    for (const p of [a, b]) {
      expect(p).not.toContain('PASSING_GATE_OUTPUT');
      expect(p).not.toContain('HARNESS_MARKER');
      expect(p).not.toContain('OTHER_EVIDENCE_MARKER');
      expect(p).not.toContain('harness source');
    }
  });

  it('uses a new agent sandbox per attempt and destroys each one', async () => {
    const t = setup({ verifyScript: (n) => `kind ${['a', 'b', 'c', 'd'][n] ?? 'e'}x` });
    await runRepairLoop(t.deps, RUN);
    expect(new Set(t.created.map((c) => c.id)).size).toBe(3);
    expect(t.created.every((c) => c.purpose === 'agent')).toBe(true);
    expect(t.destroyed.sort()).toEqual(t.created.map((c) => c.id).sort());
  });

  it('a protected-path repair patch fails the run and is not stored', async () => {
    const t = setup({ verifyScript: () => 'org B read org A row', repairMode: () => 'harness' });
    expect(await runRepairLoop(t.deps, RUN)).toBe('failed');
    expect(t.saved).toHaveLength(0);
    expect(t.verifiers).toHaveLength(1);
    expect(t.destroyed).toHaveLength(1);
    const e = (await t.evidence.list(RUN)).find((x) => x.kind === 'repair_result');
    expect((e?.payload as { outcome: string }).outcome).toBe('protected_path');
  });

  it('an agent error fails the run and still destroys the sandbox', async () => {
    const t = setup({ verifyScript: () => 'org B read org A row', repairMode: () => 'throw' });
    expect(await runRepairLoop(t.deps, RUN)).toBe('failed');
    expect(t.destroyed).toHaveLength(1);
  });

  it('runRepairStep refuses a run that is not REPAIRING', async () => {
    const t = setup({ verifyScript: () => null });
    await expect(runRepairStep(t.deps.repair, RUN)).rejects.toBeInstanceOf(RunStateError);
  });

  it('fingerprint ignores numbers and ids but not gate ids or wording', () => {
    const g = (gateId: string, message: string) => ({
      gate: gateId,
      status: 'failed',
      summary: '',
      findings: [{ ruleId: 'r', message }],
    });
    expect(failureFingerprint([g('x', 'row 12 failed')])).toBe(
      failureFingerprint([g('x', 'row 99 failed')]),
    );
    expect(failureFingerprint([g('x', 'row 12 failed')])).not.toBe(
      failureFingerprint([g('y', 'row 12 failed')]),
    );
    expect(failureFingerprint([g('x', 'row 12 failed')])).not.toBe(
      failureFingerprint([g('x', 'row 12 broke')]),
    );
  });

  it('property: at most 3 repairs, and AWAITING_APPROVAL only after a recorded pass', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.option(fc.constantFrom('one', 'two', 'three'), { nil: null }), {
          minLength: 1,
          maxLength: 6,
        }),
        fc.array(fc.constantFrom<RepairMode>('ok', 'ok', 'harness', 'throw'), {
          minLength: 1,
          maxLength: 4,
        }),
        async (verifyOutcomes, repairModes) => {
          const t = setup({
            verifyScript: (n) => verifyOutcomes[Math.min(n, verifyOutcomes.length - 1)] ?? null,
            repairMode: (n) => repairModes[Math.min(n, repairModes.length - 1)] ?? 'ok',
          });
          await runRepairLoop(t.deps, RUN);
          expect(t.created.length).toBeLessThanOrEqual(3);
          expect(t.verifiers.length).toBeLessThanOrEqual(4);
          expect(t.destroyed).toHaveLength(t.created.length);
          if ((await stateOf(t.runs)) === 'AWAITING_APPROVAL') {
            const results = (await t.evidence.list(RUN)).filter((e) => e.kind === 'verify_result');
            expect((results[results.length - 1]?.payload as { overall: string }).overall).toBe(
              'passed',
            );
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
