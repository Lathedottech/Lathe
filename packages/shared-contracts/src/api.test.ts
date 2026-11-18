import { describe, expect, it } from 'vitest';
import {
  API_PREFIX,
  CreateProjectRequest,
  CreateRunRequest,
  DecisionRequest,
  EvidenceEntry,
  Plan,
  ROUTES,
  Run,
} from './index.js';
import { LATER, NOW, SHA256, UUID_A, UUID_B } from './test-fixtures.js';

const routes = Object.values(ROUTES);

describe('C4 routes', () => {
  it('every route is under /v1 and declares a permission', () => {
    for (const r of routes) {
      expect(r.path.startsWith(`${API_PREFIX}/`)).toBe(true);
      expect(r.permission).toMatch(/^[a-z]+\.[a-z]+$/);
    }
  });
  it('method and path are unique', () => {
    const keys = routes.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('has no merge, deploy or gate-override route', () => {
    for (const r of routes) expect(r.path).not.toMatch(/merge|deploy|override|pass/i);
  });
  it('only the event stream is SSE', () => {
    expect(routes.filter((r) => 'sse' in r).map((r) => r.path)).toEqual(['/v1/runs/:runId/events']);
  });
});

describe('C4 requests never carry tenant or verdict fields', () => {
  it('rejects an org id in a create-project body', () => {
    expect(
      CreateProjectRequest.safeParse({ name: 'KB', slug: 'kb', targetApp: 'support-desk' }).success,
    ).toBe(true);
    expect(
      CreateProjectRequest.safeParse({
        name: 'KB',
        slug: 'kb',
        targetApp: 'support-desk',
        orgId: UUID_A,
      }).success,
    ).toBe(false);
  });
  it('rejects a verdict in a decision body', () => {
    expect(DecisionRequest.safeParse({ decision: 'approved', contentSha256: SHA256 }).success).toBe(
      true,
    );
    expect(
      DecisionRequest.safeParse({ decision: 'approved', contentSha256: SHA256, gatesPassed: true })
        .success,
    ).toBe(false);
  });
  it('allows fault injection only on demo runs', () => {
    expect(
      CreateRunRequest.safeParse({
        specId: UUID_A,
        demo: true,
        faultInjection: 'drop-tenant-filter',
      }).success,
    ).toBe(true);
    expect(
      CreateRunRequest.safeParse({
        specId: UUID_A,
        demo: false,
        faultInjection: 'drop-tenant-filter',
      }).success,
    ).toBe(false);
    const run = {
      id: UUID_A,
      projectId: UUID_B,
      specId: UUID_A,
      planId: null,
      state: 'BUILDING',
      demo: false,
      faultInjection: 'drop-tenant-filter',
      repairAttempts: 0,
      createdAt: NOW,
      updatedAt: LATER,
    };
    expect(Run.safeParse(run).success).toBe(false);
  });
});

describe('C4 resources', () => {
  it('caps repair attempts at 3', () => {
    const run = {
      id: UUID_A,
      projectId: UUID_B,
      specId: UUID_A,
      planId: null,
      state: 'REPAIRING',
      demo: false,
      faultInjection: null,
      repairAttempts: 4,
      createdAt: NOW,
      updatedAt: LATER,
    };
    expect(Run.safeParse(run).success).toBe(false);
  });
  it('rejects plans with unknown or self dependencies', () => {
    const task = {
      key: 'T1',
      title: 'x',
      paths: ['apps/support-desk/src/kb/index.ts'],
      acceptanceChecks: ['harness passes'],
      dependsOn: [] as string[],
    };
    const plan = {
      id: UUID_A,
      specId: UUID_B,
      tasks: [task],
      contentSha256: SHA256,
      status: 'proposed',
      createdAt: NOW,
    };
    expect(Plan.safeParse(plan).success).toBe(true);
    expect(Plan.safeParse({ ...plan, tasks: [{ ...task, dependsOn: ['T9'] }] }).success).toBe(
      false,
    );
    expect(Plan.safeParse({ ...plan, tasks: [{ ...task, dependsOn: ['T1'] }] }).success).toBe(
      false,
    );
  });
  it('chains evidence: only the first entry has no previous hash', () => {
    const e = {
      runId: UUID_A,
      seq: 0,
      kind: 'state_change',
      sha256: SHA256,
      prevSha256: null,
      at: NOW,
      summary: 'DEFINED',
    };
    expect(EvidenceEntry.safeParse(e).success).toBe(true);
    expect(EvidenceEntry.safeParse({ ...e, seq: 1 }).success).toBe(false);
    expect(EvidenceEntry.safeParse({ ...e, prevSha256: SHA256 }).success).toBe(false);
  });
});
