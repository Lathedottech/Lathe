import type { Metadata } from 'next';
import { PageHeader, SectionGuard } from '../../../components/shell';
import { Card, EmptyState, Table, type Column } from '../../../components/ui';
import { requireSession } from '../../../lib/engine-server';
import type { MembershipSummary } from '@lathe/shared-contracts';

export const metadata: Metadata = { title: 'Settings' };

const columns: readonly Column<MembershipSummary>[] = [
  { key: 'org', header: 'Organization', cell: (m) => m.orgName },
  { key: 'role', header: 'Your role', cell: (m) => m.role },
];

async function Account() {
  const session = await requireSession();
  // SectionGuard already rendered the failure; nothing to add here.
  if (!session.ok) return null;
  const { user, memberships } = session.me;
  return (
    <>
      <Card title="Account" level={2}>
        <p>{user.name === '' ? user.email : `${user.name} (${user.email})`}</p>
      </Card>
      <Table
        caption="Your organizations"
        columns={columns}
        rows={memberships}
        rowKey={(m) => m.membershipId}
        empty={
          <EmptyState
            title="No organizations"
            description="You are not a member of any organization yet. Ask an owner to invite you."
          />
        }
      />
    </>
  );
}

export default function SettingsPage() {
  return (
    <SectionGuard href="/settings">
      <PageHeader title="Settings" lede="Your account and organization memberships." />
      <Account />
    </SectionGuard>
  );
}
