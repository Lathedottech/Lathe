import type { ReactNode } from 'react';
import type { Me, Project } from '@lathe/shared-contracts';
import { OrgMenu } from './org-menu';
import { ProjectSelector } from './project-selector';
import { visibleSections } from './sections';
import { ShellNav } from './shell-nav';
import { UserMenu } from './user-menu';
import styles from './shell.module.css';

export interface AppShellProps {
  readonly me: Me;
  /** `null` when the user cannot list projects in the active org. */
  readonly projects: readonly Project[] | null;
  readonly children: ReactNode;
}

/** Authenticated Workspace frame: brand, top bar, sidebar and the page. */
export function AppShell({ me, projects, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <a className={styles.brand} href="/projects">
        Lathe
      </a>
      <header className={styles.top}>
        <ProjectSelector projects={projects} />
        <div className={styles.topEnd}>
          <OrgMenu memberships={me.memberships} activeOrgId={me.activeOrgId} />
          <UserMenu name={me.user.name} email={me.user.email} />
        </div>
      </header>
      <div className={styles.side}>
        <ShellNav sections={visibleSections(me.permissions)} />
      </div>
      <main className={styles.main} id="main">
        {children}
      </main>
    </div>
  );
}
