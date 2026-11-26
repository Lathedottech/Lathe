import type { Metadata } from 'next';
import Link from 'next/link';
import { load } from '../../../../server/page-data';
import { getTeam } from '../../../../server/work';
import { CreateForm } from '../../../_components/forms';
import ui from '../../../_components/ui.module.css';
import { LoadError } from '../../_components/load-error';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await load(getTeam, { teamId });
  if (!team.ok)
    return <LoadError code={team.code === 'validation_failed' ? 'not_found' : team.code} />;
  const t = team.value;
  return (
    <div className={ui.stack}>
      <Link href="/teams">Back to teams</Link>
      <h1>{t.name}</h1>
      {t.canManage && (
        <section className={ui.card} aria-label="New project">
          <CreateForm
            path={`/v1/teams/${encodeURIComponent(t.id)}/projects`}
            label="Project name"
            button="Create project"
          />
        </section>
      )}
      <h2>Projects</h2>
      {t.projects.length === 0 ? (
        <p className={ui.muted}>No project you can see in this team.</p>
      ) : (
        <ul className={ui.list}>
          {t.projects.map((p) => (
            <li key={p.id} className={ui.card}>
              <Link href={`/projects/${p.id}`}>{p.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
