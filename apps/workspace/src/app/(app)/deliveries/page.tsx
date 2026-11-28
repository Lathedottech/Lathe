import type { Metadata } from 'next';
import { PageHeader, SectionGuard } from '../../../components/shell';
import { EmptyState } from '../../../components/ui';

export const metadata: Metadata = { title: 'Deliveries' };

export default function DeliveriesPage() {
  return (
    <SectionGuard href="/deliveries">
      <PageHeader title="Deliveries" />
      <EmptyState
        title="Deliveries live in a run"
        description="A run that passes verification opens a draft pull request for human approval. Open a run from its project to see it."
        action={<a href="/projects">Go to Projects</a>}
      />
    </SectionGuard>
  );
}
