import { afterEach, describe, expect, it } from 'vitest';
import {
  propertiesFixtureContract,
  startPropertiesFixtureApp,
  type PropertiesFixtureServer,
  type PropertiesVariant,
} from '../../fixtures/properties/fixture-app.js';
import { propertiesGate, runProperties } from './index.js';

let server: PropertiesFixtureServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function run(variant: PropertiesVariant, extra: { seed?: number } = {}) {
  server = await startPropertiesFixtureApp(variant);
  const r = await runProperties({
    contract: propertiesFixtureContract,
    baseUrl: server.baseUrl,
    password: server.password,
    runId: 'test',
    numRuns: 50,
    ...extra,
  });
  await server.close();
  server = undefined;
  return r;
}
const rules = (r: { findings: readonly { ruleId: string }[] }): string[] => [
  ...new Set(r.findings.map((f) => f.ruleId)),
];

describe('property suite', () => {
  it('passes the good fixture app and logs the seed', async () => {
    const r = await run('good');
    expect(r.findings).toEqual([]);
    expect(r.runs).toBe(50);
    expect(r.checks).toBeGreaterThan(100);
    expect(Number.isInteger(r.seed)).toBe(true);
    expect(r.path).toBeNull();
  });

  it('reports explicit-deny-wins as pending, never as passed', async () => {
    const r = await run('good');
    expect(r.pending).toEqual([
      expect.objectContaining({ id: 'explicit-deny-wins', status: 'pending' }),
    ]);
    server = await startPropertiesFixtureApp('good');
    const gate = propertiesGate(() =>
      Promise.resolve({
        contract: propertiesFixtureContract,
        baseUrl: (server as PropertiesFixtureServer).baseUrl,
        password: (server as PropertiesFixtureServer).password,
        runId: 'gate',
        numRuns: 10,
      }),
    );
    const g = await gate.run({} as never);
    expect(g.summary).toContain('pending');
    expect(g.findings.some((f) => f.ruleId === 'properties/pending-explicit-deny-wins')).toBe(true);
    expect(g.findings.every((f) => f.severity === 'info')).toBe(true);
  });

  it('catches a role map that leaks a permission only for some resource ids', async () => {
    const r = await run('leaky-by-id');
    expect(rules(r)).toContain('properties/grant-without-permission');
    expect(r.path).not.toBeNull();
  });

  it('catches an org check that fails only on id collision', async () => {
    const r = await run('collision');
    expect(rules(r)).toContain('properties/tenant-crossed');
    expect(r.path).not.toBeNull();
  });

  it('a gate with a violation fails', async () => {
    server = await startPropertiesFixtureApp('leaky-by-id');
    const gate = propertiesGate(() =>
      Promise.resolve({
        contract: propertiesFixtureContract,
        baseUrl: (server as PropertiesFixtureServer).baseUrl,
        password: (server as PropertiesFixtureServer).password,
        runId: 'gate',
      }),
    );
    expect((await gate.run({} as never)).status).toBe('failed');
  });

  it('is deterministic: the logged seed reproduces the same counterexample on a fresh app', async () => {
    for (const variant of ['leaky-by-id', 'collision'] as const) {
      const first = await run(variant);
      expect(first.path).not.toBeNull();
      const again = await run(variant, { seed: first.seed });
      expect(again.seed).toBe(first.seed);
      expect(again.path).toBe(first.path);
      expect(again.counterexample).toBe(first.counterexample);
      expect(rules(again)).toEqual(rules(first));
    }
  });

  it('does not use a different default seed for the same inputs', async () => {
    expect((await run('good')).seed).toBe((await run('good')).seed);
  });

  it('errors, instead of passing, when the app cannot be reached', async () => {
    const gate = propertiesGate(() => Promise.reject(new Error('app not started')));
    const g = await gate.run({} as never);
    expect(g.status).toBe('error');
  });
});
