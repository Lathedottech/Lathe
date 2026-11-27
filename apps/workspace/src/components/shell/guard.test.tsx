import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server-side guard (layout + SectionGuard) with a fake Engine. The fake is a
 * stubbed `fetch` fixture; the real-Engine run is the Playwright suite.
 */
class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/projects',
}));
let cookie: string | null = 'lathe.session_token=abc';
vi.mock('next/headers', () => ({
  headers: async () => new Headers(cookie === null ? {} : { cookie }),
}));

const { SectionGuard } = await import('./page');
const { default: AppLayout } = await import('../../app/(app)/layout');

const ORG = '22222222-2222-4222-8222-222222222222';
const REQ = '11111111-1111-4111-8111-111111111111';
const me = {
  user: { id: '44444444-4444-4444-8444-444444444444', name: 'Ada', email: 'ada@example.test' },
  memberships: [
    {
      membershipId: '33333333-3333-4333-8333-333333333333',
      orgId: ORG,
      orgName: 'Acme',
      role: 'viewer',
    },
  ],
  activeOrgId: ORG,
  permissions: ['runs.read'],
};

/** Fake Engine fixture: answers by path, records what it was asked. */
let routes: Record<string, { status: number; body: unknown }> = {};
let seen: { path: string; cookie: string | null }[] = [];
beforeEach(() => {
  cookie = 'lathe.session_token=abc';
  seen = [];
  routes = { '/v1/me': { status: 200, body: me } };
  vi.stubEnv('LATHE_ENGINE_URL', 'http://engine.test');
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    const h = new Headers(init.headers);
    seen.push({ path: url.pathname, cookie: h.get('cookie') });
    const r = routes[url.pathname] ?? { status: 404, body: undefined };
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function renderAsync(node: Promise<ReactElement>) {
  render(await node);
}

describe('protected routes', () => {
  it('redirect to sign-in when there is no session', async () => {
    cookie = null;
    routes['/v1/me'] = {
      status: 401,
      body: { code: 'unauthenticated', message: 'no session', requestId: REQ },
    };
    await expect(AppLayout({ children: 'secret' })).rejects.toThrow('redirect /sign-in');
    await expect(SectionGuard({ href: '/runs', children: 'secret' })).rejects.toThrow(
      'redirect /sign-in',
    );
    expect(seen[0]).toEqual({ path: '/v1/me', cookie: null });
  });

  it('render no shell and no page when /v1/me fails', async () => {
    routes['/v1/me'] = {
      status: 500,
      body: { code: 'internal', message: 'Engine error', requestId: REQ },
    };
    await renderAsync(AppLayout({ children: 'secret' }));
    expect(screen.getByRole('alert').textContent).toContain('Engine error');
    expect(screen.getByText(REQ)).toBeTruthy();
    expect(screen.queryByText('secret')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('render no shell when /v1/me does not match the contract', async () => {
    routes['/v1/me'] = { status: 200, body: { ...me, permissions: ['*'] } };
    await renderAsync(AppLayout({ children: 'secret' }));
    expect(screen.queryByText('secret')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('render no shell when the Engine URL is missing, and call nothing', async () => {
    vi.stubEnv('LATHE_ENGINE_URL', '');
    await renderAsync(AppLayout({ children: 'secret' }));
    expect(screen.getByRole('alert').textContent).toContain('not configured');
    expect(seen).toHaveLength(0);
  });

  it('forward the session cookie to /v1/me', async () => {
    await renderAsync(AppLayout({ children: 'page body' }));
    expect(seen[0]).toEqual({ path: '/v1/me', cookie: 'lathe.session_token=abc' });
    expect(screen.getByText('page body')).toBeTruthy();
  });

  it('do not ask for projects when the role cannot read them', async () => {
    await renderAsync(AppLayout({ children: 'page body' }));
    expect(seen.map((s) => s.path)).toEqual(['/v1/me']);
  });

  it('show "no access" for a section the role lacks, and not the page', async () => {
    await renderAsync(SectionGuard({ href: '/agents', children: 'agent list' }));
    expect(screen.getByRole('alert').textContent).toContain("You don't have access");
    expect(screen.queryByText('agent list')).toBeNull();
  });

  it('render the page for a section the role has', async () => {
    await renderAsync(SectionGuard({ href: '/runs', children: 'run list' }));
    expect(screen.getByText('run list')).toBeTruthy();
  });

  it('ask for an org before showing a section when none is active', async () => {
    routes['/v1/me'] = { status: 200, body: { ...me, activeOrgId: null, permissions: [] } };
    await renderAsync(SectionGuard({ href: '/runs', children: 'run list' }));
    expect(screen.getByText('Choose an organization')).toBeTruthy();
    expect(screen.queryByText('run list')).toBeNull();
  });

  it('reject an unknown section', async () => {
    await expect(SectionGuard({ href: '/admin', children: 'x' })).rejects.toThrow(
      'unknown Workspace section',
    );
  });
});
