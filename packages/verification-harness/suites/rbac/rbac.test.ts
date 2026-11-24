import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  rbacFixtureContract,
  startRbacFixtureApp,
  type RbacFixtureServer,
  type RbacVariant,
} from '../../fixtures/rbac/fixture-app.js';
import { routeFixtures } from '../../fixtures/rbac/route-sources.js';
import {
  checkDenyByDefault,
  rbacGate,
  readAppSources,
  runRbacMatrix,
  scanSource,
} from './index.js';

let server: RbacFixtureServer | undefined;
let dir: string | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function run(variant: RbacVariant, contract = rbacFixtureContract) {
  server = await startRbacFixtureApp(variant);
  return runRbacMatrix({
    contract,
    baseUrl: server.baseUrl,
    password: server.password,
    runId: 'test',
  });
}
const rules = (r: { findings: readonly { ruleId: string }[] }): string[] => [
  ...new Set(r.findings.map((f) => f.ruleId)),
];

describe('RBAC matrix suite', () => {
  it('passes the good fixture app and exercises every principal and action', async () => {
    const r = await run('good');
    expect(r.findings).toEqual([]);
    const { principals, actions } = rbacFixtureContract;
    expect(r.pairs).toBe(principals.length * actions.length);
    expect(r.checks).toBeGreaterThan(r.pairs);
  });

  it('accepts 403 as a denial as well as 404', async () => {
    expect((await run('forbidden-ok')).findings).toEqual([]);
  });

  const defects: [RbacVariant, string[]][] = [
    ['over-permissive-role', ['rbac/over-permissive', 'rbac/denied-mutated']],
    ['editor-locked-out', ['rbac/allowed-denied']],
    ['open-without-session', ['rbac/no-session']],
  ];
  it.each(defects)('catches the planted defect %s', async (variant, expected) => {
    const r = await run(variant);
    for (const rule of expected) expect(rules(r)).toContain(rule);
  });

  it('catches a denied action that still mutates, even though it answers 404', async () => {
    const r = await run('mutates-on-deny');
    expect(rules(r)).toContain('rbac/denied-mutated');
    expect(rules(r)).not.toContain('rbac/over-permissive');
  });

  it('names the principal and action, and never leaks the password or marker', async () => {
    const r = await run('over-permissive-role');
    const text = JSON.stringify(r.findings);
    expect(text).toContain('viewer');
    expect(text).toContain('items.delete');
    expect(text).not.toContain(server?.password ?? 'unreachable');
    expect(text).not.toContain('lathe-rbac-test');
  });

  it('fails when principals cannot sign in', async () => {
    server = await startRbacFixtureApp('good');
    const r = await runRbacMatrix({
      contract: rbacFixtureContract,
      baseUrl: server.baseUrl,
      password: 'wrong',
      runId: 'test',
    });
    expect(rules(r)).toContain('rbac/sign-in-failed');
  });

  it('fails when a tenant table has no create action, so it cannot be silently skipped', async () => {
    const noCreate = {
      ...rbacFixtureContract,
      actions: rbacFixtureContract.actions.filter((a) => a.kind !== 'create'),
    };
    const r = await run('good', noCreate);
    expect(rules(r)).toContain('rbac/no-create-action');
    expect(rules(r)).toContain('rbac/no-checks');
  });

  it('fails when nothing can confirm a denied action left the data alone', async () => {
    const blind = {
      ...rbacFixtureContract,
      actions: rbacFixtureContract.actions.filter((a) => a.kind !== 'read' && a.kind !== 'list'),
    };
    expect(rules(await run('good', blind))).toContain('rbac/cannot-verify-no-mutation');
  });
});

describe('deny-by-default scan', () => {
  it.each(routeFixtures)('$name', (f) => {
    const r = scanSource({ path: f.path, text: f.text });
    if (f.expect === 'pass') {
      expect(r.violations).toEqual([]);
    } else {
      const got = r.violations.map((x) => x.ruleId);
      for (const rule of f.expect) expect(got).toContain(rule);
    }
  });

  it('every pass fixture that is a handler file checks at least one export', () => {
    for (const f of routeFixtures.filter((x) => x.expect === 'pass')) {
      const r = scanSource({ path: f.path, text: f.text });
      if (r.handler) expect(r.exports).toBeGreaterThan(0);
    }
  });

  it('reports the line of the unwrapped export', () => {
    const f = routeFixtures.find((x) => x.name === 'one wrapped, one unwrapped');
    const r = checkDenyByDefault([{ path: f?.path ?? '', text: f?.text ?? '' }]);
    expect(r.findings.map((x) => x.line)).toEqual([3]);
  });

  it('fails when an app has no route or server action file', () => {
    const r = checkDenyByDefault([{ path: 'lib/x.ts', text: 'export const x = 1;\n' }]);
    expect(rules(r)).toEqual(['rbac/no-handler-files']);
  });

  it('flags one bad file among good ones', () => {
    const good = routeFixtures[0];
    const bad = routeFixtures.find((x) => x.name === 'unwrapped route arrow');
    const r = checkDenyByDefault([
      { path: 'app/a/route.ts', text: good?.text ?? '' },
      { path: 'app/b/route.ts', text: bad?.text ?? '' },
    ]);
    expect(r.findings.map((x) => x.path)).toEqual(['app/b/route.ts']);
  });
});

describe('rbacGate', () => {
  const ctx = {
    app: 'fixture-app',
    worktree: '/w',
    commit: 'a'.repeat(40),
    faultInjection: null,
    patch: null,
  };

  async function appDirWith(route: string): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), 'lathe-rbac-'));
    await mkdir(join(dir, 'src', 'app', 'api', 'items'), { recursive: true });
    await writeFile(join(dir, 'src', 'app', 'api', 'items', 'route.ts'), route);
    await writeFile(join(dir, 'src', 'app', 'api', 'items', 'route.test.ts'), 'export {};\n');
    return dir;
  }

  it('reads sources, skipping tests', async () => {
    const d = await appDirWith(routeFixtures[0]?.text ?? '');
    const files = await readAppSources(d);
    expect(files.map((f) => f.path)).toEqual(['src/app/api/items/route.ts']);
  });

  it.each([
    ['good', 0, 'passed'],
    ['good', 4, 'failed'], // unwrapped route, good matrix
    ['over-permissive-role', 0, 'failed'], // wrapped route, bad matrix
  ] as const)('%s app with route fixture %i gives %s', async (variant, index, status) => {
    const route = index === 0 ? routeFixtures[0] : routeFixtures[index];
    const d = await appDirWith(route?.text ?? '');
    server = await startRbacFixtureApp(variant);
    const s = server;
    const out = await rbacGate(() =>
      Promise.resolve({
        contract: rbacFixtureContract,
        baseUrl: s.baseUrl,
        password: s.password,
        runId: 'gate',
        appDir: d,
      }),
    ).run(ctx);
    expect(out.status).toBe(status);
    if (status === 'failed') expect(out.findings.length).toBeGreaterThan(0);
  });

  it('reports error, never a pass, when the app cannot be reached', async () => {
    const out = await rbacGate(() => Promise.reject(new Error('no app'))).run(ctx);
    expect(out.status).toBe('error');
  });
});
