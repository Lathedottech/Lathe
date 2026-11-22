import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, KiroEvent, SandboxSpec, SessionRequest } from './index.js';
import { NOW, UUID_A } from './test-fixtures.js';

const hardening = {
  user: 'non-root',
  capDrop: 'ALL',
  noNewPrivileges: true,
  readOnlyRootFs: true,
  privileged: false,
  dockerSocket: false,
};
const spec = {
  purpose: 'agent',
  image: 'lathe/sandbox@sha256:' + 'b'.repeat(64),
  mounts: [
    { source: 'target-app', containerPath: '/workspace/app', mode: 'rw' },
    { source: 'kiro-session', containerPath: '/workspace/home', mode: 'rw' },
  ],
  secretEnv: [],
  egressAllowlist: ['runtime.us-east-1.kiro.dev'],
  limits: { cpus: 2, memoryMb: 2048, pids: 256 },
  hardening,
};

describe('contracts v1.2', () => {
  it('reports 1.2.0', () => {
    expect(CONTRACT_VERSION).toBe('1.2.0');
  });
  it('an agent sandbox may mount the Kiro session read-write', () => {
    expect(SandboxSpec.safeParse(spec).success).toBe(true);
  });
  it('a verifier may never mount the Kiro session', () => {
    expect(
      SandboxSpec.safeParse({ ...spec, purpose: 'verifier', egressAllowlist: [] }).success,
    ).toBe(false);
  });
  it('the foundation is still read-only', () => {
    const mounts = [
      ...spec.mounts,
      { source: 'application-foundation', containerPath: '/workspace/foundation', mode: 'rw' },
    ];
    expect(SandboxSpec.safeParse({ ...spec, mounts }).success).toBe(false);
  });
  it('a permission policy is optional and limited to /workspace', () => {
    const req = {
      runId: UUID_A,
      agentProfile: 'builder',
      cwd: '/workspace/app',
      prompt: 'x',
      timeoutMs: 60_000,
      mcpServers: [],
    };
    expect(SessionRequest.safeParse(req).success).toBe(true);
    const policy = { allowWritesUnder: ['/workspace/app'], allowCommands: false };
    expect(SessionRequest.safeParse({ ...req, permissionPolicy: policy }).success).toBe(true);
    expect(
      SessionRequest.safeParse({ ...req, permissionPolicy: { ...policy, allowWritesUnder: ['/'] } })
        .success,
    ).toBe(false);
    expect(
      SessionRequest.safeParse({ ...req, permissionPolicy: { ...policy, allowWritesUnder: [] } })
        .success,
    ).toBe(false);
  });
  it('records permission decisions', () => {
    const e = {
      sessionId: 's1',
      seq: 3,
      at: NOW,
      type: 'permission_request',
      toolCallId: 't1',
      title: 'write file',
      decision: 'rejected',
      reason: 'write outside /workspace/app',
    };
    expect(KiroEvent.safeParse(e).success).toBe(true);
    expect(KiroEvent.safeParse({ ...e, decision: 'maybe' }).success).toBe(false);
  });
});
