import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Me, Project } from '@lathe/shared-contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
let pathname = '/projects';
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => pathname,
}));

const { AppShell } = await import('./app-shell');

const ORG_A = '22222222-2222-4222-8222-222222222222';
const ORG_B = '55555555-5555-4555-8555-555555555555';
const MEM_A = '33333333-3333-4333-8333-333333333333';
const MEM_B = '66666666-6666-4666-8666-666666666666';
const PROJECT = '77777777-7777-4777-8777-777777777777';

const me = (over: Partial<Me> = {}): Me =>
  ({
    user: { id: '44444444-4444-4444-8444-444444444444', name: 'Ada', email: 'ada@example.test' },
    memberships: [
      { membershipId: MEM_A, orgId: ORG_A, orgName: 'Acme', role: 'owner' },
      { membershipId: MEM_B, orgId: ORG_B, orgName: 'Globex', role: 'viewer' },
    ],
    activeOrgId: ORG_A,
    permissions: ['projects.read', 'runs.read', 'agents.read'],
    ...over,
  }) as Me;

const projects = [
  {
    id: PROJECT,
    name: 'Support Desk KB',
    slug: 'kb',
    targetApp: 'support-desk',
    repository: null,
    createdAt: '2026-11-20T10:00:00.000Z',
  },
] as unknown as Project[];

/** Test fixture: records same-origin POSTs instead of reaching an Engine. */
let posts: { url: string; body: unknown }[] = [];
let postStatus = 200;
beforeEach(() => {
  posts = [];
  postStatus = 200;
  pathname = '/projects';
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    posts.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(
      postStatus === 200
        ? '{}'
        : JSON.stringify({ code: 'not_found', message: 'not found', requestId: MEM_A }),
      { status: postStatus },
    );
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const nav = () => screen.getByRole('navigation', { name: 'Workspace' });

describe('AppShell', () => {
  it('shows only the sections the permissions allow, plus Settings', () => {
    render(
      <AppShell me={me()} projects={projects}>
        page
      </AppShell>,
    );
    const labels = within(nav())
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(labels).toEqual(['Projects', 'Factory Runs', 'Agents', 'Settings']);
  });

  it('marks the current section', () => {
    pathname = `/projects/${PROJECT}`;
    render(
      <AppShell me={me()} projects={projects}>
        page
      </AppShell>,
    );
    expect(within(nav()).getByRole('link', { name: 'Projects' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('shows the user, the active org and the role in it', () => {
    render(
      <AppShell me={me()} projects={projects}>
        page
      </AppShell>,
    );
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('ada@example.test')).toBeTruthy();
    expect((screen.getByLabelText('Organization') as HTMLSelectElement).value).toBe(MEM_A);
    expect(screen.getByTestId('active-role').textContent).toBe('owner');
  });

  it('switches org by sending only the membership id', async () => {
    render(
      <AppShell me={me()} projects={projects}>
        page
      </AppShell>,
    );
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: MEM_B } });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(posts).toEqual([{ url: '/v1/session/active-org', body: { membershipId: MEM_B } }]);
  });

  it('shows the Engine error when an org switch is refused and does not refresh', async () => {
    postStatus = 404;
    render(
      <AppShell me={me()} projects={projects}>
        page
      </AppShell>,
    );
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: MEM_B } });
    expect((await screen.findByRole('alert')).textContent).toBe('not found');
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('signs out through the auth route and goes to sign-in', async () => {
    render(
      <AppShell me={me()} projects={projects}>
        page
      </AppShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'));
    expect(posts.map((p) => p.url)).toEqual(['/auth/sign-out']);
  });

  it('opens the chosen project from the project selector', () => {
    render(
      <AppShell me={me()} projects={projects}>
        page
      </AppShell>,
    );
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: PROJECT } });
    expect(router.push).toHaveBeenCalledWith(`/projects/${PROJECT}`);
  });

  it('hides the project selector when projects cannot be listed', () => {
    render(
      <AppShell me={me({ permissions: ['runs.read'] })} projects={null}>
        page
      </AppShell>,
    );
    expect(screen.queryByLabelText('Project')).toBeNull();
  });

  it('without an active org shows a chooser and only Settings', () => {
    render(
      <AppShell me={me({ activeOrgId: null, permissions: [] })} projects={null}>
        page
      </AppShell>,
    );
    expect((screen.getByLabelText('Organization') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByTestId('active-role')).toBeNull();
    expect(
      within(nav())
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Settings']);
  });
});
