import type { Metadata } from 'next';
import Link from 'next/link';
import { load } from '../../../../server/page-data';
import { getProject, listTasks } from '../../../../server/work';
import { CreateForm, TaskControls } from '../../../_components/forms';
import ui from '../../../_components/ui.module.css';
import { LoadError } from '../../_components/load-error';

export const metadata: Metadata = { title: 'Project' };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, tasks] = await Promise.all([
    load(getProject, { projectId }),
    load(listTasks, { projectId }),
  ]);
  if (!project.ok)
    return <LoadError code={project.code === 'validation_failed' ? 'not_found' : project.code} />;
  const p = project.value;
  return (
    <div className={ui.stack}>
      <Link href={`/teams/${p.teamId}`}>Back to team</Link>
      <h1>{p.name}</h1>
      {p.can.createTask && (
        <section className={ui.card} aria-label="New task">
          <CreateForm
            path={`/v1/projects/${encodeURIComponent(p.id)}/tasks`}
            label="Task"
            button="Add task"
            field="title"
          />
        </section>
      )}
      {!tasks.ok ? (
        <LoadError code={tasks.code} />
      ) : tasks.value.items.length === 0 ? (
        <p className={ui.muted}>No tasks yet.</p>
      ) : (
        <ul className={ui.list}>
          {tasks.value.items.map((t) => (
            <li key={t.id} className={`${ui.card} ${ui.row}`}>
              <strong>{t.title}</strong>
              <TaskControls
                projectId={p.id}
                id={t.id}
                status={t.status}
                canUpdate={p.can.updateTask}
                canDelete={p.can.deleteTask}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
