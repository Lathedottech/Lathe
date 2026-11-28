import type { Metadata } from 'next';
import { PageHeader, SectionGuard } from '../../../components/shell';
import { EmptyState } from '../../../components/ui';

export const metadata: Metadata = { title: 'Factory Runs' };

export default function RunsPage() {
  return (
    <SectionGuard href="/runs">
      <PageHeader title="Factory Runs" />
      <EmptyState
        title="Runs live in a project"
        description="Open a project to start a factory run and follow it live."
        action={<a href="/projects">Go to Projects</a>}
      />
    </SectionGuard>
  );
}
