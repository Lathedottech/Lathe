import type { Metadata } from 'next';
import type { Project } from '@lathe/shared-contracts';
import { FailureState, PageHeader, SectionGuard } from '../../../components/shell';
import { EmptyState, Table, type Column } from '../../../components/ui';
import { engineGet } from '../../../lib/engine';
import { engineContext } from '../../../lib/engine-server';

export const metadata: Metadata = { title: 'Projects' };

const columns: readonly Column<Project>[] = [
  {
    key: 'name',
    header: 'Project',
    cell: (p) => <a href={`/projects/${encodeURIComponent(p.id)}`}>{p.name}</a>,
  },
  { key: 'app', header: 'Target app', cell: (p) => <code>{p.targetApp}</code> },
  {
    key: 'repo',
    header: 'Repository',
    cell: (p) => (p.repository ? `${p.repository.owner}/${p.repository.name}` : 'Not connected'),
  },
  {
    key: 'created',
    header: 'Created',
    cell: (p) => new Date(p.createdAt).toLocaleDateString('en'),
  },
];

async function ProjectList() {
  const r = await engineGet(await engineContext(), 'listProjects', {}, { limit: '100' });
  if (!r.ok) return <FailureState failure={r} />;
  return (
    <Table
      caption="Factory projects"
      columns={columns}
      rows={r.data.items}
      rowKey={(p) => p.id}
      empty={
        <EmptyState
          title="No projects yet"
          description="A project ties a target app to its specifications and factory runs."
        />
      }
    />
  );
}

export default function ProjectsPage() {
  return (
    <SectionGuard href="/projects">
      <PageHeader
        title="Projects"
        lede="Apps that Lathe builds and verifies in this organization."
      />
      <ProjectList />
    </SectionGuard>
  );
}
