import type { Metadata } from 'next';
import Link from 'next/link';
import { orgActions } from '../../../server/members';
import { load } from '../../../server/page-data';
import { listTeams } from '../../../server/work';
import { CreateForm } from '../../_components/forms';
import ui from '../../_components/ui.module.css';
import { LoadError } from '../_components/load-error';

export const metadata: Metadata = { title: 'Teams' };

export default async function TeamsPage() {
  const [teams, me] = await Promise.all([load(listTeams), load(orgActions.getMe)]);
  if (!teams.ok) return <LoadError code={teams.code} />;
  const perms = me.ok ? me.value.permissions : [];
  return (
    <div className={ui.stack}>
      <h1>Teams</h1>
      {perms.includes('scopes.manage') && (
        <section className={ui.card} aria-label="New team">
          <CreateForm path="/v1/teams" label="Team name" button="Create team" />
        </section>
      )}
      {teams.value.length === 0 ? (
        <p className={ui.muted}>No team you can see yet.</p>
      ) : (
        <ul className={ui.list}>
          {teams.value.map((t) => (
            <li key={t.id} className={ui.card}>
              <Link href={`/teams/${t.id}`}>{t.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
