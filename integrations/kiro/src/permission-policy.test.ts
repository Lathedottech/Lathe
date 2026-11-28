import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decidePermission, type PermissionPolicy } from './permission-policy.js';

const policy: PermissionPolicy = { allowWritesUnder: ['/workspace/app'], allowCommands: false };
const readRoots = ['/workspace/app', '/workspace/application-foundation'];

type ToolCall = Parameters<typeof decidePermission>[1];

function call(kind: string, paths: string[] = [], rawInput?: unknown): ToolCall {
  return {
    toolCallId: 'tc',
    kind,
    ...(paths.length > 0 ? { locations: paths.map((path) => ({ path })) } : {}),
    ...(rawInput !== undefined ? { rawInput } : {}),
  };
}
const decide = (c: ToolCall) => decidePermission(policy, c, readRoots).allowed;

describe('reads are confined to the read roots', () => {
  it('allows reads under the app and foundation mounts', () => {
    expect(decide(call('read', ['/workspace/app/src/a.ts']))).toBe(true);
    expect(decide(call('search', ['/workspace/application-foundation/src']))).toBe(true);
    expect(decide(call('read', ['/workspace/app']))).toBe(true);
  });
  it('denies the Kiro session token', () => {
    expect(decide(call('read', ['/home/agent/.kiro/token.json']))).toBe(false);
    expect(decide(call('read', ['/home/agent/.kiro']))).toBe(false);
  });
  it('denies /proc, /sys, /dev and /etc', () => {
    for (const p of ['/proc/self/environ', '/sys/kernel', '/dev/null', '/etc/passwd'])
      expect(decide(call('read', [p]))).toBe(false);
  });
  it('denies a read with no locations and no path', () => {
    expect(decide(call('read'))).toBe(false);
    expect(decide(call('search'))).toBe(false);
  });
  it('denies reads that name a path only in rawInput', () => {
    expect(decide(call('read', [], { path: '/proc/self/environ' }))).toBe(false);
    expect(decide(call('read', ['/workspace/app/a.ts'], { file_path: '/etc/shadow' }))).toBe(false);
  });
  it('lets think pass without a path and checks it with one', () => {
    expect(decide(call('think'))).toBe(true);
    expect(decide(call('think', [], { thought: 'plan the change' }))).toBe(true);
    expect(decide(call('think', [], { path: '/home/agent/.kiro/token.json' }))).toBe(false);
    expect(decide(call('think', ['/proc/self/environ']))).toBe(false);
  });
});

describe('writes check locations and every rawInput path', () => {
  it('denies a move whose destination is outside', () => {
    const c = call('move', ['/workspace/app/a.ts'], {
      source: '/workspace/app/a.ts',
      destination: '/home/agent/.kiro/a.ts',
    });
    expect(decide(c)).toBe(false);
  });
  it('denies an edit whose rawInput.path is outside', () => {
    expect(decide(call('edit', ['/workspace/app/a.ts'], { path: '/workspace/other/a.ts' }))).toBe(
      false,
    );
  });
  it('allows a write when every path is inside', () => {
    const c = call('move', ['/workspace/app/a.ts'], {
      from: '/workspace/app/a.ts',
      to: '/workspace/app/b.ts',
    });
    expect(decide(c)).toBe(true);
  });
  it('finds absolute paths in nested objects and arrays', () => {
    expect(decide(call('edit', ['/workspace/app/a.ts'], { ops: [{ x: '/etc/passwd' }] }))).toBe(
      false,
    );
    expect(decide(call('edit', ['/workspace/app/a.ts'], { a: { b: { c: '/proc/1/mem' } } }))).toBe(
      false,
    );
  });
  it('denies a relative path in a path field', () => {
    expect(decide(call('edit', ['/workspace/app/a.ts'], { path: '../a.ts' }))).toBe(false);
  });
  it('denies a write with no path at all', () => {
    expect(decide(call('edit'))).toBe(false);
    expect(decide(call('edit', [], { content: 'x' }))).toBe(false);
  });
  it('checks the cwd of a command and still honours allowCommands', () => {
    const allow: PermissionPolicy = { ...policy, allowCommands: true };
    const run = (rawInput: unknown) =>
      decidePermission(allow, call('execute', [], rawInput), readRoots, { commandsEnabled: true })
        .allowed;
    expect(run({ command: 'pnpm test', cwd: '/workspace/app' })).toBe(true);
    expect(run({ command: 'pnpm test', cwd: '/home/agent/.kiro' })).toBe(false);
    expect(decide(call('execute', [], { command: 'ls' }))).toBe(false);
  });
});

describe('path normalization', () => {
  it('treats /workspace/app2 as outside /workspace/app', () => {
    expect(decide(call('edit', ['/workspace/app2/a.ts']))).toBe(false);
    expect(decide(call('read', ['/workspace/app2/a.ts']))).toBe(false);
  });
  it('resolves .. before checking', () => {
    expect(decide(call('edit', ['/workspace/app/../../home/agent/.kiro/token.json']))).toBe(false);
    expect(decide(call('read', ['/workspace/app/../../etc/passwd']))).toBe(false);
    expect(decide(call('edit', ['/workspace/app/src/../a.ts']))).toBe(true);
  });
  it('collapses duplicate and trailing slashes', () => {
    expect(decide(call('read', ['/workspace//app///a.ts']))).toBe(true);
    expect(decide(call('read', ['/workspace/app/']))).toBe(true);
    expect(decide(call('read', ['//home/agent/.kiro//token.json']))).toBe(false);
    expect(decide(call('read', ['/proc//self/environ']))).toBe(false);
  });
});

describe('property: decisions follow the roots', () => {
  const segment = fc.constantFrom(
    'app',
    'app2',
    'application-foundation',
    'src',
    'a.ts',
    '..',
    '.',
    '',
    'etc',
    'proc',
    'home',
    'agent',
    '.kiro',
    'workspace',
    'dev',
    'sys',
  );
  const absPath = fc
    .array(segment, { minLength: 0, maxLength: 7 })
    .map((s) => '/' + s.join('/'))
    .filter((p) => p.length < 200);
  const pathKey = fc.constantFrom('path', 'destination', 'target', 'cwd', 'from', 'to');
  const kind = fc.constantFrom('read', 'search', 'think', 'edit', 'delete', 'move');
  const request = fc.record({
    kind,
    locations: fc.array(absPath, { maxLength: 3 }),
    raw: fc.array(fc.tuple(pathKey, absPath), { maxLength: 3 }),
  });

  const norm = (p: string): string => {
    const out: string[] = [];
    for (const s of p.split('/')) {
      if (s === '' || s === '.') continue;
      if (s === '..') out.pop();
      else out.push(s);
    }
    return '/' + out.join('/');
  };
  const under = (p: string, root: string): boolean => p === root || p.startsWith(root + '/');
  const denied = ['/home/agent/.kiro', '/proc', '/sys', '/dev', '/etc'];

  it('rejects whenever any path is outside the roots or inside a denied root', () => {
    fc.assert(
      fc.property(request, (r) => {
        const rawInput = Object.fromEntries(r.raw);
        const c = call(r.kind, r.locations, r.raw.length > 0 ? rawInput : undefined);
        const all = [...r.locations, ...r.raw.map(([, p]) => p)].map(norm);
        const roots =
          r.kind === 'edit' || r.kind === 'delete' || r.kind === 'move'
            ? policy.allowWritesUnder
            : readRoots;
        const bad = all.some(
          (p) => denied.some((d) => under(p, d)) || !roots.some((root) => under(p, root)),
        );
        const allowed = decidePermission(policy, c, readRoots).allowed;
        if (bad) expect(allowed).toBe(false);
        // Anything allowed must have at least one path, except think.
        if (allowed && r.kind !== 'think') expect(all.length).toBeGreaterThan(0);
        if (!bad && all.length > 0) expect(allowed).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});

describe('uri, url and href are path keys', () => {
  it('rejects file:// URIs outside the roots, in known and unknown keys', () => {
    expect(decide(call('read', [], { uri: 'file:///etc/passwd' }))).toBe(false);
    expect(decide(call('read', ['/workspace/app/a.ts'], { whatever: 'file:///etc/passwd' }))).toBe(
      false,
    );
    expect(decide(call('read', [], { nested: [{ x: 'file:///proc/self/environ' }] }))).toBe(false);
    expect(
      decide(call('read', [], { uri: 'file:///workspace/app/%2e%2e/%2e%2e/etc/passwd' })),
    ).toBe(false);
  });
  it('allows a file:// URI inside the roots and rejects other schemes or hosts', () => {
    expect(decide(call('read', [], { uri: 'file:///workspace/app/src/a.ts' }))).toBe(true);
    expect(decide(call('read', [], { url: 'https://example.com/a' }))).toBe(false);
    expect(decide(call('read', [], { href: 'file://host/workspace/app/a.ts' }))).toBe(false);
  });
});

describe('execute is denied unless commands are enabled and the command is on the allow-list', () => {
  const allow: PermissionPolicy = { ...policy, allowCommands: true };
  const base = { cwd: '/workspace/app' };
  const on = (command: string) =>
    decidePermission(allow, call('execute', [], { command, ...base }), readRoots, {
      commandsEnabled: true,
    }).allowed;

  it('denies execute by default, even with allowCommands in the policy', () => {
    const c = call('execute', [], { command: 'pnpm test', ...base });
    expect(decidePermission(allow, c, readRoots).allowed).toBe(false);
    expect(decidePermission(allow, c, readRoots, { commandsEnabled: false }).allowed).toBe(false);
  });
  it('allows allow-listed commands inside /workspace/app', () => {
    expect(on('pnpm test')).toBe(true);
    expect(on('pnpm exec vitest run src/a.test.ts')).toBe(true);
    expect(on('pnpm exec tsc --noEmit')).toBe(true);
    expect(on('git status --short')).toBe(true);
    expect(on('git diff --stat')).toBe(true);
    expect(on('pnpm test /workspace/app/src')).toBe(true);
  });
  it('denies the review probes', () => {
    for (const cmd of [
      'cat /etc/passwd',
      'cat ../../../etc/passwd',
      'printenv KIRO_API_KEY',
      'echo $KIRO_API_KEY',
      'sh -c "cat /proc/self/environ"',
    ])
      expect(on(cmd), cmd).toBe(false);
    const noCwd = call('execute', [], { command: 'cat /etc/passwd' });
    expect(decidePermission(allow, noCwd, readRoots, { commandsEnabled: true }).allowed).toBe(
      false,
    );
  });
  it('denies path escapes, variables, substitutions, redirects and chaining', () => {
    for (const cmd of [
      'pnpm test ../other',
      'pnpm test /etc/hosts',
      'pnpm test /workspace/app2/x',
      'pnpm test /home/agent/.kiro/token.json',
      'pnpm test --config=/etc/vitest.js',
      'pnpm test ~/x',
      'pnpm test $HOME',
      'pnpm test ${HOME}',
      'pnpm test $(id)',
      'pnpm test `id`',
      'pnpm test > /etc/x',
      'pnpm test > out.txt',
      'pnpm test && cat /etc/passwd',
      'pnpm test; env',
      'pnpm test | sh',
      'pnpm test file:///etc/passwd',
      'pnpm run evil',
      'pnpm exec node -e 1',
      'pnpm exec env',
      'git diff --no-index /etc/passwd x',
      'git -c core.pager=sh diff',
      'env',
      'export A=1',
      'set',
      'cd /etc',
      'node -e "1"',
      'npx tsc',
      '/usr/bin/pnpm test',
      'pnpm test "unterminated',
    ])
      expect(on(cmd), cmd).toBe(false);
  });
  it('denies a missing or non-string command and a bad cwd', () => {
    const run = (raw: unknown) =>
      decidePermission(allow, call('execute', [], raw), readRoots, { commandsEnabled: true })
        .allowed;
    expect(run({})).toBe(false);
    expect(run({ command: 7 })).toBe(false);
    expect(run({ command: 'pnpm test', cwd: '/etc' })).toBe(false);
    expect(run({ command: ['pnpm', 'test'], cwd: '/workspace/app' })).toBe(true);
    expect(run({ command: ['cat', '/etc/passwd'], cwd: '/workspace/app' })).toBe(false);
  });
  it('property: escapes are denied, and nothing runs without the enable flag', () => {
    const word = fc.constantFrom(
      'test',
      '/etc/passwd',
      '../x',
      '/proc/self/environ',
      '/workspace/app/src',
      'src',
      '/home/agent/.kiro/a',
      '--run',
      '/sys/x',
      '/dev/null',
    );
    fc.assert(
      fc.property(fc.array(word, { maxLength: 4 }), (args) => {
        const bad = args.some((a) => /\.\.|^\/(etc|proc|sys|dev|home)/.test(a));
        const allowed = on(['pnpm test', ...args].join(' '));
        if (bad) expect(allowed).toBe(false);
        else expect(allowed).toBe(true);
      }),
      { numRuns: 300 },
    );
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (command) => {
        const c = call('execute', [], { command, ...base });
        expect(decidePermission(allow, c, readRoots).allowed).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});
