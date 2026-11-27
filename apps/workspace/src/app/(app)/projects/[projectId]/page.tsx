import type { Metadata } from 'next';
import { FailureState, PageHeader, SectionGuard } from '../../../../components/shell';
import { Card, EmptyState } from '../../../../components/ui';
import { engineGet } from '../../../../lib/engine';
import { engineContext } from '../../../../lib/engine-server';

export const metadata: Metadata = { title: 'Project' };

async function ProjectDetail({ projectId }: { readonly projectId: string }) {
  const r = await engineGet(await engineContext(), 'getProject', { projectId });
  if (!r.ok) return <FailureState failure={r} />;
  const p = r.data;
  return (
    <>
      <PageHeader title={p.name} lede={`Builds into apps/${p.targetApp}`} />
      <Card title="Repository" level={2}>
        <p>
          {p.repository
            ? `${p.repository.owner}/${p.repository.name}`
            : 'No repository connected. Delivery opens no pull request until one is set.'}
        </p>
      </Card>
      <EmptyState
        title="Specifications and runs"
        description="The project workspace (specifications, plan approval and run history) is added in task P9-04."
      />
    </>
  );
}

export default async function ProjectPage({
  params,
}: {
  readonly params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <SectionGuard href="/projects">
      <ProjectDetail projectId={projectId} />
    </SectionGuard>
  );
}
