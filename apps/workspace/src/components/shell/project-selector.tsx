'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useId } from 'react';
import type { Project } from '@lathe/shared-contracts';
import styles from './shell.module.css';

export interface ProjectSelectorProps {
  /** Projects from `GET /v1/projects`, or `null` when the user cannot list them. */
  readonly projects: readonly Project[] | null;
}

/** Top-bar project selector. Choosing a project opens it; nothing else is stored. */
export function ProjectSelector({ projects }: ProjectSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  if (projects === null) return null;
  if (projects.length === 0) return <span className={styles.muted}>No projects yet</span>;

  const current = /^\/projects\/([^/]+)/.exec(pathname)?.[1] ?? '';
  return (
    <div className={styles.menu}>
      <label htmlFor={id} className={styles.menuLabel}>
        Project
      </label>
      <select
        id={id}
        className={styles.select}
        value={projects.some((p) => p.id === current) ? current : ''}
        onChange={(e) => {
          if (e.target.value !== '') router.push(`/projects/${encodeURIComponent(e.target.value)}`);
        }}
      >
        <option value="">Choose a project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
