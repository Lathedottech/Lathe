import type { Metadata } from 'next';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  CodeBlock,
  DiffBlock,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  SideNav,
  Stat,
  StatusChip,
  Table,
  Tabs,
  TextArea,
  TextField,
  TopNav,
  type Status,
} from '../../components/ui';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Design system',
  // Internal reference page (P9-00), not part of the product.
  robots: { index: false, follow: false },
};

const STATUSES: Status[] = [
  'DEFINED',
  'PLANNED',
  'BUILDING',
  'VERIFYING',
  'REPAIRING',
  'AWAITING_APPROVAL',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'passed',
  'failed',
  'error',
  'not_run',
];

const NAV = [
  { href: '/overview', label: 'Overview' },
  { href: '/projects', label: 'Projects' },
  { href: '/runs', label: 'Factory runs' },
  { href: '/verification', label: 'Verification' },
];

// Illustrative content for this reference page only. No screen shows sample data (wireframes.md).
const SAMPLE_ROWS = [
  { id: 'gate-1', gate: 'protected-paths', status: 'passed' as const, ms: 41 },
  { id: 'gate-2', gate: 'tenant-isolation', status: 'failed' as const, ms: 2310 },
  { id: 'gate-3', gate: 'rbac', status: 'not_run' as const, ms: 0 },
];

const SAMPLE_DIFF = `diff --git a/src/kb/articles.ts b/src/kb/articles.ts
--- a/src/kb/articles.ts
+++ b/src/kb/articles.ts
@@ -1,3 +1,3 @@
 export async function listArticles(tx) {
-  return tx.select().from(articles);
+  return tx.select().from(articles).where(eq(articles.orgId, ctx.orgId));
 }`;

export default function DesignSystemPage() {
  return (
    <>
      <TopNav
        label="Design system sections"
        brand="Lathe · Design system"
        items={[
          { href: '#actions', label: 'Actions' },
          { href: '#status', label: 'Status' },
          { href: '#forms', label: 'Forms' },
          { href: '#data', label: 'Data' },
          { href: '#states', label: 'States' },
        ]}
      />
      <main className={styles.page}>
        <p className={styles.lead}>
          Reference for task P9-00. Every screen uses only these components and the tokens in{' '}
          <code>src/styles/tokens.css</code>. Content below is illustrative.
        </p>

        <Card title="Actions" id="actions">
          <div className={styles.row}>
            <Button variant="primary">Approve plan</Button>
            <Button>Cancel run</Button>
            <Button variant="danger">Reject</Button>
            <Button variant="ghost">Details</Button>
            <Button busy variant="primary">
              Approving
            </Button>
            <Button size="sm">Small</Button>
          </div>
        </Card>

        <Card title="Status" id="status">
          <div className={styles.row}>
            {STATUSES.map((s) => (
              <StatusChip key={s} status={s} />
            ))}
          </div>
          <div className={styles.row}>
            <Badge>v3</Badge>
            <Badge tone="accent">draft</Badge>
          </div>
          <div className={styles.stats}>
            <Stat label="Active projects" value={3} />
            <Stat label="Running runs" value={1} />
            <Stat label="Pending approvals" value={null} detail="not loaded yet" />
          </div>
        </Card>

        <Card title="Forms" id="forms">
          <div className={styles.grid}>
            <TextField label="Project name" hint="Shown in the sidebar" />
            <TextField label="Slug" error="Use lower-case letters, digits and dashes" />
            <Select label="Target app" defaultValue="support-desk">
              <option value="support-desk">support-desk</option>
              <option value="team-operations">team-operations</option>
            </Select>
            <TextArea label="Specification" />
            <Checkbox label="Demo run" />
          </div>
        </Card>

        <Card title="Navigation and data" id="data">
          <div className={styles.split}>
            <SideNav label="Example workspace navigation" items={NAV} current="/runs" />
            <div className={styles.stack}>
              <Tabs
                label="Run sections"
                items={[
                  {
                    id: 'gates',
                    label: 'Gates',
                    content: (
                      <Table
                        caption="Gates, attempt 1"
                        columns={[
                          { key: 'gate', header: 'Gate', cell: (r) => r.gate },
                          {
                            key: 'status',
                            header: 'Result',
                            cell: (r) => <StatusChip status={r.status} />,
                          },
                          { key: 'ms', header: 'Duration (ms)', cell: (r) => r.ms, align: 'end' },
                        ]}
                        rows={SAMPLE_ROWS}
                        rowKey={(r) => r.id}
                        empty={<EmptyState title="No gate results yet" />}
                      />
                    ),
                  },
                  {
                    id: 'diff',
                    label: 'Patch',
                    content: <DiffBlock label="Patch, attempt 1" diff={SAMPLE_DIFF} />,
                  },
                  {
                    id: 'log',
                    label: 'Agent output',
                    content: (
                      <CodeBlock
                        label="Agent output (untrusted, shown as text)"
                        text={'<script>alert(1)</script>\nThis tag is shown, never run.'}
                      />
                    ),
                  },
                ]}
              />
            </div>
          </div>
        </Card>

        <Card title="States" id="states">
          <div className={styles.grid}>
            <EmptyState
              title="No projects yet"
              description="Create a factory project to start a run."
              action={<Button variant="primary">Create factory project</Button>}
            />
            <LoadingState label="Loading runs" />
            <ErrorState
              message="The Engine did not answer."
              requestId="00000000-0000-4000-8000-000000000000"
              action={<Button>Try again</Button>}
            />
          </div>
        </Card>
      </main>
    </>
  );
}
