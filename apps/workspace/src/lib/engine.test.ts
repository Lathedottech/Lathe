import { describe, expect, it } from 'vitest';
import { engineGet, parseEngineUrl, routePath, type EngineContext } from './engine';

const ENGINE = 'http://engine.test';
const REQ = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const MEM = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';

const me = {
  user: { id: USER, name: 'Ada', email: 'ada@example.test' },
  memberships: [{ membershipId: MEM, orgId: ORG, orgName: 'Acme', role: 'owner' }],
  activeOrgId: ORG,
  permissions: ['projects.read'],
};

interface Call {
  url: string;
  init: RequestInit;
}

function fake(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return (async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body === undefined ? '' : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

const ctx = (f: typeof fetch, extra: Partial<EngineContext> = {}): EngineContext => ({
  baseUrl: ENGINE,
  cookie: 'lathe.session_token=abc',
  fetch: f,
  ...extra,
});

describe('engineGet', () => {
  it('returns the parsed body on 200 and calls the C4 path', async () => {
    const calls: Call[] = [];
    const r = await engineGet(ctx(fake(200, me, calls)), 'getMe');
    expect(r).toEqual({ ok: true, data: me });
    expect(calls[0]?.url).toBe(`${ENGINE}/v1/me`);
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('forwards only the cookie header, never an org id', async () => {
    const calls: Call[] = [];
    await engineGet(ctx(fake(200, me, calls)), 'getMe');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(Object.keys(headers).sort()).toEqual(['accept', 'cookie']);
    expect(headers['cookie']).toBe('lathe.session_token=abc');
    expect(calls[0]?.url).not.toContain(ORG);
  });

  it('does not cache and does not follow redirects', async () => {
    const calls: Call[] = [];
    await engineGet(ctx(fake(200, me, calls)), 'getMe');
    expect(calls[0]?.init.cache).toBe('no-store');
    expect(calls[0]?.init.redirect).toBe('manual');
  });

  it('denies a 200 body that does not match the C4 schema', async () => {
    const forged = { ...me, permissions: ['projects.read'], activeOrgId: null };
    const r = await engineGet(ctx(fake(200, forged)), 'getMe');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.kind).toBe('error');
  });

  it('denies a 200 body with an extra field (strict schema)', async () => {
    const r = await engineGet(ctx(fake(200, { ...me, isAdmin: true })), 'getMe');
    expect(r.ok === false && r.kind).toBe('error');
  });

  it('maps 401 to unauthenticated', async () => {
    const r = await engineGet(
      ctx(fake(401, { code: 'unauthenticated', message: 'no session', requestId: REQ })),
      'getMe',
    );
    expect(r).toEqual({ ok: false, kind: 'unauthenticated' });
  });

  it('maps 403 and 404 and keeps the API error message and request id', async () => {
    const f = await engineGet(
      ctx(fake(403, { code: 'forbidden', message: 'role lacks projects.read', requestId: REQ })),
      'listProjects',
    );
    expect(f).toEqual({
      ok: false,
      kind: 'forbidden',
      message: 'role lacks projects.read',
      requestId: REQ,
    });
    const n = await engineGet(
      ctx(fake(404, { code: 'not_found', message: 'not found', requestId: REQ })),
      'getProject',
      { projectId: ORG },
    );
    expect(n.ok === false && n.kind).toBe('not_found');
  });

  it('treats any other status, or a non-JSON body, as an error', async () => {
    const r = await engineGet(ctx(fake(500, undefined)), 'getMe');
    expect(r).toEqual({
      ok: false,
      kind: 'error',
      message: 'The Factory Engine answered with status 500.',
    });
    const redirect = await engineGet(ctx(fake(302, undefined)), 'getMe');
    expect(redirect.ok === false && redirect.kind).toBe('error');
  });

  it('reports an unreachable Engine as an error', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const r = await engineGet(ctx(down), 'getMe');
    expect(r).toEqual({
      ok: false,
      kind: 'error',
      message: 'The Factory Engine could not be reached.',
    });
  });

  it('makes no call without a valid Engine URL', async () => {
    const calls: Call[] = [];
    for (const baseUrl of [undefined, '', 'ftp://engine.test', 'http://u:p@engine.test']) {
      const r = await engineGet(ctx(fake(200, me, calls), { baseUrl }), 'getMe');
      expect(r.ok === false && r.kind).toBe('error');
    }
    expect(calls).toHaveLength(0);
  });

  it('URI-encodes path parameters so they cannot add a path segment', async () => {
    const calls: Call[] = [];
    await engineGet(ctx(fake(404, undefined, calls)), 'getProject', {
      projectId: '../session/active-org',
    });
    expect(calls[0]?.url).toBe(`${ENGINE}/v1/projects/..%2Fsession%2Factive-org`);
  });
});

describe('parseEngineUrl and routePath', () => {
  it('accepts only a bare http(s) origin', () => {
    expect(parseEngineUrl('http://127.0.0.1:4000')?.origin).toBe('http://127.0.0.1:4000');
    expect(parseEngineUrl('https://engine.test/')?.origin).toBe('https://engine.test');
    for (const bad of [
      'engine.test',
      'http://engine.test/v1',
      'http://engine.test?x=1',
      'javascript:alert(1)',
    ])
      expect(parseEngineUrl(bad)).toBeNull();
  });

  it('throws on a missing parameter', () => {
    expect(() => routePath('/v1/projects/:projectId', {})).toThrow('projectId');
  });
});
