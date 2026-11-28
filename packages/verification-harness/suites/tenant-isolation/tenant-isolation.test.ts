import { afterEach, describe, expect, it } from 'vitest';
import {
  fixtureContract,
  fixtureContractWithIdField,
  startFixtureApp,
  type FixtureOptions,
  type FixtureServer,
  type Variant,
} from '../../fixtures/tenant-isolation/fixture-app.js';
import { tenantIsolationGate } from './index.js';
import { runTenantIsolation } from './run.js';

let server: FixtureServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function run(
  variant: Variant,
  contract = fixtureContract,
  fixture: FixtureOptions = {},
  withOrgIds = true,
) {
  server = await startFixtureApp(variant, fixture);
  return runTenantIsolation({
    contract,
    baseUrl: server.baseUrl,
    password: server.password,
    runId: 'test',
    ...(withOrgIds ? { orgIds: server.orgIds } : {}),
  });
}
const rules = (r: { findings: readonly { ruleId: string }[] }): string[] => [
  ...new Set(r.findings.map((f) => f.ruleId)),
];

describe('tenant isolation suite', () => {
  it('passes the good fixture app and evaluates checks', async () => {
    const r = await run('good');
    expect(r.findings).toEqual([]);
    expect(r.checks).toBeGreaterThan(15);
  });

  const leaks: [Variant, string[]][] = [
    [
      'missing-org-filter',
      [
        'isolation/cross-list',
        'isolation/cross-read',
        'isolation/cross-update',
        'isolation/cross-delete',
      ],
    ],
    [
      'missing-rls-policy',
      ['isolation/cross-read', 'isolation/cross-update', 'isolation/cross-delete'],
    ],
    ['org-from-input', ['isolation/org-from-input']],
    ['forbidden-on-foreign', ['isolation/cross-read', 'isolation/distinguishable']],
  ];
  it.each(leaks)('catches the planted leak %s', async (variant, expected) => {
    const r = await run(variant);
    expect(r.findings.length).toBeGreaterThan(0);
    for (const rule of expected) expect(rules(r)).toContain(rule);
  });

  it('catches org-from-input when the app never returns org_id (org a id comes from the seed)', async () => {
    const r = await run('org-from-input', fixtureContract, { stripOrgId: true });
    expect(rules(r)).toContain('isolation/org-from-input');
  });

  it('passes the good app when org_id is stripped from every response', async () => {
    expect((await run('good', fixtureContract, { stripOrgId: true })).findings).toEqual([]);
  });

  it('emits isolation/org-id-unknown instead of passing when no trusted org id is given', async () => {
    const r = await run('org-from-input', fixtureContract, { stripOrgId: true }, false);
    expect(rules(r)).toContain('isolation/org-id-unknown');
    const good = await run('good', fixtureContract, {}, false);
    expect(rules(good)).toContain('isolation/org-id-unknown');
  });

  it('reads the row id from the create action idField (noteId)', async () => {
    const contract = fixtureContractWithIdField('noteId');
    expect((await run('good', contract, { idField: 'noteId' })).findings).toEqual([]);
    const leaky = await run('missing-org-filter', contract, { idField: 'noteId' });
    expect(rules(leaky)).toContain('isolation/cross-read');
  });

  it('fails closed when the create response has no id under the declared idField', async () => {
    const r = await run('good', fixtureContractWithIdField('noteId'), { idField: 'other' });
    expect(rules(r)).toContain('isolation/create-failed');
  });

  it('missing-rls-policy does not leak through list, so the list check stays quiet', async () => {
    expect(rules(await run('missing-rls-policy'))).not.toContain('isolation/cross-list');
  });

  it('never puts the password or response bodies in findings', async () => {
    const r = await run('missing-org-filter');
    const text = JSON.stringify(r.findings);
    expect(text).not.toContain(server?.password ?? 'unreachable');
    expect(text).not.toContain('lathe-iso-test');
  });

  it('fails when a tenant table has no create action, so it cannot be silently skipped', async () => {
    const noCreate = {
      ...fixtureContract,
      actions: fixtureContract.actions.filter((a) => a.kind !== 'create'),
    };
    const r = await run('good', noCreate);
    expect(rules(r)).toContain('isolation/no-create-action');
    expect(rules(r)).toContain('isolation/no-checks');
  });

  it('fails when principals cannot sign in', async () => {
    server = await startFixtureApp('good');
    const r = await runTenantIsolation({
      contract: fixtureContract,
      baseUrl: server.baseUrl,
      password: 'wrong',
      runId: 'test',
    });
    expect(rules(r)).toContain('isolation/sign-in-failed');
  });
});

describe('tenantIsolationGate', () => {
  const ctx = {
    app: 'fixture-app',
    worktree: '/w',
    commit: 'a'.repeat(40),
    faultInjection: null,
    patch: null,
  };

  it('passes the good app and fails a leaky one', async () => {
    for (const [variant, status] of [
      ['good', 'passed'],
      ['org-from-input', 'failed'],
    ] as const) {
      server = await startFixtureApp(variant);
      const s = server;
      const out = await tenantIsolationGate(() =>
        Promise.resolve({
          contract: fixtureContract,
          baseUrl: s.baseUrl,
          password: s.password,
          runId: 'gate',
          orgIds: s.orgIds,
        }),
      ).run(ctx);
      expect(out.status).toBe(status);
      if (status === 'failed') expect(out.findings.length).toBeGreaterThan(0);
      await s.close();
      server = undefined;
    }
  });

  it('reports error, never a pass, when the app cannot be reached', async () => {
    const out = await tenantIsolationGate(() => Promise.reject(new Error('no app'))).run(ctx);
    expect(out.status).toBe('error');
  });
});
