import { describe, expect, it } from 'vitest';
import { GATE_ORDER, VERIFY_EXIT_CODES, VerificationReport } from './index.js';
import type { GateResult, GateStatus } from './index.js';
import { GIT_SHA, LATER, NOW, SHA256, at } from './test-fixtures.js';

const gate = (id: (typeof GATE_ORDER)[number], status: GateStatus): GateResult => ({
  gate: id,
  status,
  durationMs: status === 'not_run' ? 0 : 10,
  summary: status,
  findings:
    status === 'failed'
      ? [
          {
            ruleId: 'tenant.cross-org-read',
            message: 'org B read a row of org A',
            severity: 'critical',
          },
        ]
      : [],
  artifacts: [],
});
const report = (statuses: GateStatus[], overall: string, faultInjection: unknown = null) => ({
  schemaVersion: 1,
  app: 'support-desk',
  commit: GIT_SHA,
  harnessSha256: SHA256,
  policySha256: SHA256,
  resultHash: SHA256,
  startedAt: NOW,
  finishedAt: LATER,
  overall,
  gates: GATE_ORDER.map((id, i) => gate(id, at(statuses, i))),
  faultInjection,
});
const allPassed = GATE_ORDER.map((): GateStatus => 'passed');
// tenant-isolation (index 3) fails, the rest after it do not run
const isolationFails: GateStatus[] = [
  'passed',
  'passed',
  'passed',
  'failed',
  'not_run',
  'not_run',
  'not_run',
];

describe('C3 VerificationReport', () => {
  it('keeps the documented gate order', () => {
    expect(GATE_ORDER).toEqual([
      'protected-paths',
      'static',
      'tests',
      'tenant-isolation',
      'rbac',
      'properties',
      'security',
    ]);
    expect(VERIFY_EXIT_CODES).toEqual({ passed: 0, failed: 1, error: 2 });
  });
  it('accepts a passing report and a fail-fast failing report', () => {
    expect(VerificationReport.safeParse(report(allPassed, 'passed')).success).toBe(true);
    expect(VerificationReport.safeParse(report(isolationFails, 'failed')).success).toBe(true);
  });
  it('rejects overall passed when a gate failed', () => {
    expect(VerificationReport.safeParse(report(isolationFails, 'passed')).success).toBe(false);
  });
  it('rejects a missing, duplicated or reordered gate', () => {
    const r = report(allPassed, 'passed');
    expect(VerificationReport.safeParse({ ...r, gates: r.gates.slice(1) }).success).toBe(false);
    expect(
      VerificationReport.safeParse({ ...r, gates: [r.gates[1], r.gates[0], ...r.gates.slice(2)] })
        .success,
    ).toBe(false);
  });
  it('rejects gates that ran after a failure, and not_run before one', () => {
    expect(
      VerificationReport.safeParse(
        report(['passed', 'passed', 'passed', 'failed', 'passed', 'not_run', 'not_run'], 'failed'),
      ).success,
    ).toBe(false);
    expect(
      VerificationReport.safeParse(
        report(['not_run', 'passed', 'passed', 'passed', 'passed', 'passed', 'passed'], 'passed'),
      ).success,
    ).toBe(false);
  });
  it('rejects a failed gate without findings', () => {
    const r = report(isolationFails, 'failed');
    r.gates[3] = { ...at(r.gates, 3), findings: [] };
    expect(VerificationReport.safeParse(r).success).toBe(false);
  });
  it('reports error over failed', () => {
    const statuses: GateStatus[] = [
      'passed',
      'error',
      'not_run',
      'not_run',
      'not_run',
      'not_run',
      'not_run',
    ];
    expect(VerificationReport.safeParse(report(statuses, 'error')).success).toBe(true);
    expect(VerificationReport.safeParse(report(statuses, 'failed')).success).toBe(false);
  });
  it('requires the exact injected-fault label', () => {
    expect(
      VerificationReport.safeParse(
        report(isolationFails, 'failed', {
          name: 'drop-tenant-filter',
          label: 'injected by Lathe',
        }),
      ).success,
    ).toBe(true);
    expect(
      VerificationReport.safeParse(
        report(isolationFails, 'failed', { name: 'drop-tenant-filter', label: 'agent bug' }),
      ).success,
    ).toBe(false);
  });
});
