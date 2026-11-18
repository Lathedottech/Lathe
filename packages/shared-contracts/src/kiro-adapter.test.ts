import { describe, expect, expectTypeOf, it } from 'vitest';
import { KiroEvent, SandboxSpec, SessionRequest } from './index.js';
import type { KiroAdapter, KiroSession, SandboxHandle, SessionId, TurnResult } from './index.js';
import { NOW, UUID_A } from './test-fixtures.js';

const digest = 'lathe/sandbox@sha256:' + 'b'.repeat(64);
const hardening = {
  user: 'non-root',
  capDrop: 'ALL',
  noNewPrivileges: true,
  readOnlyRootFs: true,
  privileged: false,
  dockerSocket: false,
};
const agentSpec = {
  purpose: 'agent',
  image: digest,
  mounts: [
    { source: 'target-app', containerPath: '/workspace/app', mode: 'rw' },
    { source: 'application-foundation', containerPath: '/workspace/foundation', mode: 'ro' },
  ],
  secretEnv: ['KIRO_API_KEY'],
  egressAllowlist: ['api.example.com'],
  limits: { cpus: 2, memoryMb: 2048, pids: 256 },
  hardening,
};

describe('C2 SessionRequest', () => {
  const req = {
    runId: UUID_A,
    agentProfile: 'builder',
    cwd: '/workspace/app',
    prompt: 'Implement T1',
    timeoutMs: 600_000,
    mcpServers: [],
  };
  it('accepts a request with no MCP servers', () => {
    expect(SessionRequest.safeParse(req).success).toBe(true);
  });
  it('rejects any MCP server', () => {
    expect(
      SessionRequest.safeParse({ ...req, mcpServers: [{ name: 'github', command: 'x' }] }).success,
    ).toBe(false);
  });
  it('rejects a cwd outside /workspace', () => {
    expect(SessionRequest.safeParse({ ...req, cwd: '/workspace/../etc' }).success).toBe(false);
    expect(SessionRequest.safeParse({ ...req, cwd: '/root' }).success).toBe(false);
  });
});

describe('C2 SandboxSpec', () => {
  it('accepts a hardened agent sandbox', () => {
    expect(SandboxSpec.safeParse(agentSpec).success).toBe(true);
  });
  it.each(Object.keys(hardening))('rejects relaxing hardening flag %s', (key) => {
    const relaxed = {
      ...hardening,
      [key]:
        key === 'user'
          ? 'root'
          : key === 'capDrop'
            ? 'NONE'
            : !hardening[key as keyof typeof hardening],
    };
    expect(SandboxSpec.safeParse({ ...agentSpec, hardening: relaxed }).success).toBe(false);
  });
  it('rejects a read-write foundation mount', () => {
    const mounts = [
      agentSpec.mounts[0],
      { source: 'application-foundation', containerPath: '/workspace/foundation', mode: 'rw' },
    ];
    expect(SandboxSpec.safeParse({ ...agentSpec, mounts }).success).toBe(false);
  });
  it('cannot mount the verification harness or .github', () => {
    const mounts = [
      ...agentSpec.mounts,
      { source: 'verification-harness', containerPath: '/workspace/harness', mode: 'ro' },
    ];
    expect(SandboxSpec.safeParse({ ...agentSpec, mounts }).success).toBe(false);
  });
  it('rejects any credential other than the Kiro one', () => {
    expect(SandboxSpec.safeParse({ ...agentSpec, secretEnv: ['GITHUB_TOKEN'] }).success).toBe(
      false,
    );
  });
  it('gives a verifier no credentials and no egress', () => {
    const verifier = { ...agentSpec, purpose: 'verifier', egressAllowlist: [], secretEnv: [] };
    expect(SandboxSpec.safeParse(verifier).success).toBe(true);
    expect(SandboxSpec.safeParse({ ...verifier, secretEnv: ['KIRO_API_KEY'] }).success).toBe(false);
    expect(
      SandboxSpec.safeParse({ ...verifier, egressAllowlist: ['api.example.com'] }).success,
    ).toBe(false);
  });
  it('requires an image pinned by digest', () => {
    expect(SandboxSpec.safeParse({ ...agentSpec, image: 'lathe/sandbox:latest' }).success).toBe(
      false,
    );
  });
  it('rejects wildcard egress hosts', () => {
    expect(
      SandboxSpec.safeParse({ ...agentSpec, egressAllowlist: ['*.example.com'] }).success,
    ).toBe(false);
  });
});

describe('C2 KiroEvent', () => {
  it('parses each event type', () => {
    const base = { sessionId: 'sess_1', seq: 0, at: NOW };
    const events = [
      { ...base, type: 'agent_message_chunk', text: 'hi' },
      {
        ...base,
        type: 'tool_call',
        toolCallId: 't1',
        title: 'write file',
        status: 'pending',
        input: { path: 'a' },
      },
      { ...base, type: 'tool_call_update', toolCallId: 't1', status: 'completed' },
      { ...base, type: 'turn_end', stopReason: 'end_turn' },
      { ...base, type: 'adapter_error', code: 'timeout', message: 'session exceeded timeoutMs' },
    ];
    for (const e of events) expect(KiroEvent.safeParse(e).success).toBe(true);
    expect(KiroEvent.safeParse({ ...base, type: 'gate_passed' }).success).toBe(false);
  });
});

describe('C2 interfaces (type level)', () => {
  it('has the documented shape', () => {
    expectTypeOf<KiroAdapter['start']>().returns.resolves.toEqualTypeOf<KiroSession>();
    expectTypeOf<KiroSession['id']>().toEqualTypeOf<SessionId>();
    expectTypeOf<KiroSession['prompt']>().returns.resolves.toEqualTypeOf<TurnResult>();
    expectTypeOf<KiroSession['cancel']>().parameters.toEqualTypeOf<[reason: string]>();
    expectTypeOf<SandboxHandle['destroy']>().returns.resolves.toBeVoid();
  });
});
