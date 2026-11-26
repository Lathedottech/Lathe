import {
  ActionError,
  canInScope,
  createScopeInTx,
  defineAction,
  defineScopeActions,
  defineScopedAction,
  loadScopeContextInTx,
  memberships,
  type ScopedActionContext,
} from '@lathe/application-foundation';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { authz } from './authz';
import { projects, tasks, teams, TASK_STATUSES, type TaskRow } from './schema';

/**
 * Team Operations actions (task P7-02), on the P7-01 hierarchy org -> team -> project.
 *
 * Every team and project route is `defineScopedAction`: the foundation resolves the
 * scope in the active org (unknown or foreign: 404), loads the caller's grants and
 * denies on its chain, and checks the permission with `canInScope` before the handler
 * runs. So a guest with a grant on team A sees team A and its projects and nothing else,
 * and an explicit deny on a project blocks even the owner there.
 *
 * Lists show only what the caller may read: each team or project is checked with
 * `canInScope` on its own chain. Anything the caller may not read answers 404 by id.
 */

export interface Team {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}
export interface Project {
  readonly id: string;
  readonly teamId: string;
  readonly name: string;
  readonly createdAt: string;
}
export interface Task {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly body: string;
  readonly status: (typeof TASK_STATUSES)[number];
  readonly assigneeMembershipId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const notFound = (): never => {
  throw new ActionError('not_found', 'not found');
};

const Name = z.string().trim().min(1).max(120);
const Title = z.string().trim().min(1).max(200);
const Body = z.string().max(10_000);
const Status = z.enum(TASK_STATUSES);
const TeamRef = z.strictObject({ teamId: z.uuid() });
const ProjectRef = z.strictObject({ projectId: z.uuid() });
const TaskRef = ProjectRef.extend({ id: z.uuid() });

/** The resolved scope must be of `kind`; a team id used as a project (or back) is a 404. */
function requireKind(ctx: ScopedActionContext, kind: 'team' | 'project'): string {
  if (ctx.scope?.kind !== kind) return notFound();
  return ctx.scope.id;
}

/** What the caller may do on `chain`, for list filtering and UI hints. */
async function allows(
  ctx: ScopedActionContext,
  chain: readonly string[],
  permission: string,
): Promise<boolean> {
  const sc = await loadScopeContextInTx(ctx.tx, ctx.orgId, ctx.membership, chain);
  return canInScope(authz, sc, permission);
}

// ---- teams --------------------------------------------------------------------------

/** Creating a team needs `scopes.manage` org-wide. */
export const createTeam = defineScopedAction(authz, {
  permission: 'scopes.manage',
  action: 'team.create',
  resourceType: 'team',
  input: z.strictObject({ name: Name }),
  scope: () => null,
  handler: async (ctx, input) => {
    const scope = await createScopeInTx(ctx.tx, ctx.orgId, { kind: 'team', parentId: null });
    const [row] = await ctx.tx
      .insert(teams)
      .values({ id: scope.id, orgId: ctx.orgId, name: input.name, createdBy: ctx.principal.userId })
      .returning()
      .catch((error: unknown) => conflictOnUnique(error, 'a team with this name exists'));
    if (!row) throw new Error('insert into teams returned no row');
    return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() } satisfies Team;
  },
  resourceId: (t) => t.id,
});

/** Every team the caller may read: org-wide `teams.read`, or a grant on that team. */
export const listTeams = defineAction(authz, {
  permission: 'scopes.read',
  resourceType: 'team',
  input: z.strictObject({}),
  handler: async (ctx) => {
    const rows = await ctx.tx
      .select()
      .from(teams)
      .where(eq(teams.orgId, ctx.orgId))
      .orderBy(asc(teams.name))
      .limit(200);
    const out: Team[] = [];
    for (const r of rows) {
      const sc = await loadScopeContextInTx(ctx.tx, ctx.orgId, ctx.membership, [r.id]);
      if (canInScope(authz, sc, 'teams.read'))
        out.push({ id: r.id, name: r.name, createdAt: r.createdAt.toISOString() });
    }
    return out;
  },
});

export const getTeam = defineScopedAction(authz, {
  permission: 'teams.read',
  resourceType: 'team',
  input: TeamRef,
  scope: (i) => i.teamId,
  handler: async (ctx) => {
    const id = requireKind(ctx, 'team');
    const [row] = await ctx.tx
      .select()
      .from(teams)
      .where(and(eq(teams.id, id), eq(teams.orgId, ctx.orgId)));
    if (!row) return notFound();
    const visible = await ctx.tx
      .select()
      .from(projects)
      .where(and(eq(projects.orgId, ctx.orgId), eq(projects.teamId, id)))
      .orderBy(asc(projects.name));
    const list: Project[] = [];
    for (const p of visible)
      if (await allows(ctx, [id, p.id], 'projects.read'))
        list.push({
          id: p.id,
          teamId: p.teamId,
          name: p.name,
          createdAt: p.createdAt.toISOString(),
        });
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      projects: list,
      canManage: canInScope(authz, ctx.scopeContext, 'scopes.manage'),
    };
  },
  resourceId: (t) => t.id,
});

// ---- projects -----------------------------------------------------------------------

/** Creating a project needs `scopes.manage` on its team (org-wide or by a team grant). */
export const createProject = defineScopedAction(authz, {
  permission: 'scopes.manage',
  action: 'project.create',
  resourceType: 'project',
  input: TeamRef.extend({ name: Name }),
  scope: (i) => i.teamId,
  handler: async (ctx, input) => {
    const teamId = requireKind(ctx, 'team');
    const scope = await createScopeInTx(ctx.tx, ctx.orgId, { kind: 'project', parentId: teamId });
    const [row] = await ctx.tx
      .insert(projects)
      .values({
        id: scope.id,
        orgId: ctx.orgId,
        teamId,
        name: input.name,
        createdBy: ctx.principal.userId,
      })
      .returning()
      .catch((error: unknown) => conflictOnUnique(error, 'a project with this name exists'));
    if (!row) throw new Error('insert into projects returned no row');
    return {
      id: row.id,
      teamId: row.teamId,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    } satisfies Project;
  },
  resourceId: (p) => p.id,
});

export const getProject = defineScopedAction(authz, {
  permission: 'projects.read',
  resourceType: 'project',
  input: ProjectRef,
  scope: (i) => i.projectId,
  handler: async (ctx) => {
    const id = requireKind(ctx, 'project');
    const [row] = await ctx.tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.orgId, ctx.orgId)));
    if (!row) return notFound();
    const sc = ctx.scopeContext;
    return {
      id: row.id,
      teamId: row.teamId,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      // UI hints only; every action re-checks.
      can: {
        createTask: canInScope(authz, sc, 'tasks.create'),
        updateTask: canInScope(authz, sc, 'tasks.update'),
        deleteTask: canInScope(authz, sc, 'tasks.delete'),
        manage: canInScope(authz, sc, 'scopes.manage'),
      },
    };
  },
  resourceId: (p) => p.id,
});

// ---- tasks --------------------------------------------------------------------------

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  projectId: r.projectId,
  title: r.title,
  body: r.body,
  status: r.status,
  assigneeMembershipId: r.assigneeMembershipId,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** Loads a task of the scoped project. A task of another project is a 404. */
async function findTask(
  ctx: ScopedActionContext,
  projectId: string,
  id: string,
  forUpdate = false,
) {
  const q = ctx.tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.projectId, projectId), eq(tasks.orgId, ctx.orgId)));
  const [row] = forUpdate ? await q.for('update') : await q;
  return row ?? notFound();
}

/** The assignee must be a member of the org who may work on tasks in this project. */
async function checkAssignee(
  ctx: ScopedActionContext,
  projectId: string,
  membershipId: string,
): Promise<void> {
  const [target] = await ctx.tx
    .select({ id: memberships.id, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.orgId, ctx.orgId)));
  if (!target) notFound();
  const chain = ctx.scope?.chain ?? [projectId];
  const sc = await loadScopeContextInTx(
    ctx.tx,
    ctx.orgId,
    target as { id: string; role: string },
    chain,
  );
  if (!canInScope(authz, sc, 'tasks.update'))
    throw new ActionError('validation_failed', 'the assignee cannot work on this project');
}

export const listTasks = defineScopedAction(authz, {
  permission: 'tasks.list',
  resourceType: 'task',
  input: ProjectRef.extend({ status: Status.optional() }),
  scope: (i) => i.projectId,
  handler: async (ctx, input) => {
    const projectId = requireKind(ctx, 'project');
    const rows = await ctx.tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.orgId, ctx.orgId),
          eq(tasks.projectId, projectId),
          input.status ? eq(tasks.status, input.status) : undefined,
        ),
      )
      .orderBy(desc(tasks.createdAt), desc(tasks.id))
      .limit(200);
    return { items: rows.map(toTask) };
  },
});

export const createTask = defineScopedAction(authz, {
  permission: 'tasks.create',
  resourceType: 'task',
  input: ProjectRef.extend({
    title: Title,
    body: Body.optional(),
    assigneeMembershipId: z.uuid().nullable().optional(),
  }),
  scope: (i) => i.projectId,
  handler: async (ctx, input) => {
    const projectId = requireKind(ctx, 'project');
    if (input.assigneeMembershipId) await checkAssignee(ctx, projectId, input.assigneeMembershipId);
    const [row] = await ctx.tx
      .insert(tasks)
      .values({
        orgId: ctx.orgId,
        projectId,
        title: input.title,
        body: input.body ?? '',
        assigneeMembershipId: input.assigneeMembershipId ?? null,
        createdBy: ctx.principal.userId,
      })
      .returning();
    if (!row) throw new Error('insert into tasks returned no row');
    return toTask(row);
  },
  resourceId: (t) => t.id,
});

export const getTask = defineScopedAction(authz, {
  permission: 'tasks.read',
  resourceType: 'task',
  input: TaskRef,
  scope: (i) => i.projectId,
  handler: async (ctx, input) => toTask(await findTask(ctx, requireKind(ctx, 'project'), input.id)),
  resourceId: (t) => t.id,
});

export const updateTask = defineScopedAction(authz, {
  permission: 'tasks.update',
  resourceType: 'task',
  input: TaskRef.extend({
    title: Title.optional(),
    body: Body.optional(),
    status: Status.optional(),
    assigneeMembershipId: z.uuid().nullable().optional(),
  }).refine(
    (v) =>
      v.title !== undefined ||
      v.body !== undefined ||
      v.status !== undefined ||
      v.assigneeMembershipId !== undefined,
    'nothing to update',
  ),
  scope: (i) => i.projectId,
  handler: async (ctx, input) => {
    const projectId = requireKind(ctx, 'project');
    const current = await findTask(ctx, projectId, input.id, true);
    if (input.assigneeMembershipId) await checkAssignee(ctx, projectId, input.assigneeMembershipId);
    const [row] = await ctx.tx
      .update(tasks)
      .set({
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.assigneeMembershipId === undefined
          ? {}
          : { assigneeMembershipId: input.assigneeMembershipId }),
        updatedAt: sql`now()`,
      })
      .where(and(eq(tasks.id, current.id), eq(tasks.orgId, ctx.orgId)))
      .returning();
    return row ? toTask(row) : notFound();
  },
  resourceId: (t) => t.id,
});

export const deleteTask = defineScopedAction(authz, {
  permission: 'tasks.delete',
  resourceType: 'task',
  input: TaskRef,
  scope: (i) => i.projectId,
  handler: async (ctx, input) => {
    const projectId = requireKind(ctx, 'project');
    const current = await findTask(ctx, projectId, input.id, true);
    await ctx.tx.delete(tasks).where(and(eq(tasks.id, current.id), eq(tasks.orgId, ctx.orgId)));
    return { id: current.id };
  },
  resourceId: (r) => r.id,
});

// ---- scope administration (P7-01) ---------------------------------------------------

/** Grants, revokes and denies on teams and projects; all anti-escalation rules from P7-01. */
export const scopeActions = defineScopeActions(authz, {
  manage: 'scopes.manage',
  read: 'scopes.read',
});

function conflictOnUnique(error: unknown, message: string): never {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if ((e as { code?: unknown }).code === '23505') throw new ActionError('conflict', message);
  }
  throw error;
}
