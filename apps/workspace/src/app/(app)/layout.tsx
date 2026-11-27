import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Project } from '@lathe/shared-contracts';
import { AppShell } from '../../components/shell';
import { ErrorState } from '../../components/ui';
import { engineContext, requireSession } from '../../lib/engine-server';
import { engineGet } from '../../lib/engine';

// Every page below reads the session, so none is rendered statically.
export const dynamic = 'force-dynamic';

async function loadProjects(permissions: readonly string[]): Promise<readonly Project[] | null> {
  if (!permissions.includes('projects.read')) return null;
  const r = await engineGet(await engineContext(), 'listProjects', {}, { limit: '100' });
  if (r.ok) return r.data.items;
  if (r.kind === 'unauthenticated') redirect('/sign-in');
  // The selector is optional; the Projects page shows the real error.
  return null;
}

/**
 * Authenticated Workspace (P9-02). Deny by default: no session redirects to
 * sign-in; any other failure to read `GET /v1/me` shows the error and no shell.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  if (!session.ok)
    return (
      <main id="main">
        <ErrorState
          title="The Workspace is unavailable"
          message={session.failure.message}
          {...(session.failure.requestId ? { requestId: session.failure.requestId } : {})}
        />
      </main>
    );
  const projects = await loadProjects(session.me.permissions);
  return (
    <AppShell me={session.me} projects={projects}>
      {children}
    </AppShell>
  );
}
