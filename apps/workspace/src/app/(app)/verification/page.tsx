import type { Metadata } from 'next';
import { PageHeader, SectionGuard } from '../../../components/shell';
import { EmptyState } from '../../../components/ui';

export const metadata: Metadata = { title: 'Verification' };

export default function VerificationPage() {
  return (
    <SectionGuard href="/verification">
      <PageHeader title="Verification" />
      <EmptyState
        title="Verification results live in a run"
        description="Each factory run records its own gate results and evidence. Open a run from its project to see them."
        action={<a href="/projects">Go to Projects</a>}
      />
    </SectionGuard>
  );
}
