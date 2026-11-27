import type { Metadata } from 'next';
import type { AgentProfileInfo } from '@lathe/shared-contracts';
import { FailureState, PageHeader, SectionGuard } from '../../../components/shell';
import { EmptyState, Table, type Column } from '../../../components/ui';
import { engineGet } from '../../../lib/engine';
import { engineContext } from '../../../lib/engine-server';

export const metadata: Metadata = { title: 'Agents' };

const columns: readonly Column<AgentProfileInfo>[] = [
  { key: 'profile', header: 'Profile', cell: (a) => a.profile },
  { key: 'description', header: 'Role', cell: (a) => a.description },
  {
    key: 'config',
    header: 'Config hash',
    cell: (a) => <code title={a.configSha256}>{a.configSha256.slice(0, 12)}</code>,
  },
];

async function AgentList() {
  const r = await engineGet(await engineContext(), 'listAgents');
  if (!r.ok) return <FailureState failure={r} />;
  return (
    <Table
      caption="Runtime agent profiles"
      columns={columns}
      rows={r.data}
      rowKey={(a) => a.profile}
      empty={
        <EmptyState
          title="No agent profiles"
          description="The Engine reports no runtime agent profiles."
        />
      }
    />
  );
}

export default function AgentsPage() {
  return (
    <SectionGuard href="/agents">
      <PageHeader
        title="Agents"
        lede="Runtime agents run only inside a sandbox during a factory run. They cannot record a verification result."
      />
      <AgentList />
    </SectionGuard>
  );
}
