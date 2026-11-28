import type { ReactNode } from 'react';
import type { EngineFailure } from '../../lib/engine';
import { requireSession } from '../../lib/engine-server';
import { EmptyState, ErrorState } from '../ui';
import { SECTIONS } from './sections';
import styles from './shell.module.css';

/** One Engine failure as a state. Forbidden never lists what exists. */
export function FailureState({ failure }: { readonly failure: EngineFailure }) {
  switch (failure.kind) {
    case 'unauthenticated':
      return <ErrorState title="Signed out" message="Sign in again to continue." />;
    case 'forbidden':
      return <ErrorState title="You don't have access" message={failure.message} />;
    case 'not_found':
      return <ErrorState title="Not found" message={failure.message} />;
    case 'error':
      return (
        <ErrorState
          message={failure.message}
          {...(failure.requestId ? { requestId: failure.requestId } : {})}
        />
      );
    default: {
      const exhaustive: never = failure;
      return exhaustive;
    }
  }
}

export interface PageHeaderProps {
  readonly title: string;
  readonly lede?: string;
}

export function PageHeader({ title, lede }: PageHeaderProps) {
  return (
    <div className={styles.pageHeader}>
      <h1>{title}</h1>
      {lede !== undefined && <p className={styles.lede}>{lede}</p>}
    </div>
  );
}

/**
 * Wraps every section page. It re-reads the session on each request (the layout
 * does not re-run on client navigation), so a signed-out user is redirected and a
 * role without the section's permission sees "no access" and nothing else.
 * This is a UI check only: the Engine still authorizes every data request.
 */
export async function SectionGuard({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  const section = SECTIONS.find((s) => s.href === href);
  if (section === undefined) throw new Error(`unknown Workspace section ${href}`);
  const session = await requireSession();
  if (!session.ok)
    return (
      <ErrorState
        message={session.failure.message}
        {...(session.failure.requestId ? { requestId: session.failure.requestId } : {})}
      />
    );
  if (section.permission !== null && session.me.activeOrgId === null)
    return (
      <EmptyState
        title="Choose an organization"
        description={
          session.me.memberships.length === 0
            ? 'You are not a member of any organization yet. Ask an owner to invite you.'
            : 'Pick the organization to work in with the selector at the top.'
        }
      />
    );
  if (section.permission !== null && !session.me.permissions.includes(section.permission))
    return (
      <ErrorState
        title="You don't have access"
        message="Your role in this organization does not include this section."
      />
    );
  return <div className={styles.page}>{children}</div>;
}
