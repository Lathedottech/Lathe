import type { Metadata } from 'next';
import { PageHeader, SectionGuard } from '../../../components/shell';
import { EmptyState } from '../../../components/ui';

export const metadata: Metadata = { title: 'Overview' };

export default function OverviewPage() {
  return (
    <SectionGuard href="/overview">
      <PageHeader title="Overview" />
      <EmptyState
        title="No dashboard in this build"
        description="The factory dashboard is not part of the current scope. Open Projects to see real projects and their runs."
        action={<a href="/projects">Go to Projects</a>}
      />
    </SectionGuard>
  );
}
