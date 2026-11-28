import type { Metadata } from 'next';
import { PageHeader, SectionGuard } from '../../../components/shell';
import { EmptyState } from '../../../components/ui';

export const metadata: Metadata = { title: 'Specifications' };

export default function SpecificationsPage() {
  return (
    <SectionGuard href="/specifications">
      <PageHeader title="Specifications" />
      <EmptyState
        title="Specifications live in a project"
        description="Open a project to write, submit and review its specifications."
        action={<a href="/projects">Go to Projects</a>}
      />
    </SectionGuard>
  );
}
