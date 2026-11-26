import { RepoRelativePath, Slug } from '@lathe/shared-contracts';
import { z } from 'zod';
import { zodIssues, type Validated } from './validated.js';

export const RequirementId = z
  .string()
  .regex(/^R[0-9]{1,3}$/, 'expected a requirement id such as R1');
export const AcceptanceCheckId = z
  .string()
  .regex(/^A[0-9]{1,3}$/, 'expected an acceptance check id such as A1');

/** True when `path` is `prefix` or inside it, on path segment boundaries. */
export function isWithinPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * A structured spec (task P3-01): what to build, where, and how it is checked.
 * `targetPaths` must lie inside `apps/<targetApp>/`, so a spec can never aim an
 * agent at the harness, CI, contracts or another app. Treated as data, never as
 * instructions to the Engine.
 */
export const SpecDocument = z
  .strictObject({
    title: z.string().min(1).max(200),
    targetApp: Slug,
    requirements: z
      .array(z.strictObject({ id: RequirementId, text: z.string().min(1).max(2_000) }))
      .min(1)
      .max(100),
    targetPaths: z.array(RepoRelativePath).min(1).max(50),
    acceptanceChecks: z
      .array(
        z.strictObject({
          id: AcceptanceCheckId,
          requirement: RequirementId,
          text: z.string().min(1).max(1_000),
        }),
      )
      .min(1)
      .max(200),
  })
  .superRefine((s, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const reqIds = s.requirements.map((r) => r.id);
    const checkIds = s.acceptanceChecks.map((c) => c.id);
    reqIds.forEach((id, i) => {
      if (reqIds.indexOf(id) !== i) issue(['requirements', i, 'id'], `duplicate requirement ${id}`);
      if (!s.acceptanceChecks.some((c) => c.requirement === id))
        issue(['requirements', i], `requirement ${id} has no acceptance check`);
    });
    checkIds.forEach((id, i) => {
      if (checkIds.indexOf(id) !== i)
        issue(['acceptanceChecks', i, 'id'], `duplicate acceptance check ${id}`);
    });
    s.acceptanceChecks.forEach((c, i) => {
      if (!reqIds.includes(c.requirement))
        issue(['acceptanceChecks', i, 'requirement'], `unknown requirement ${c.requirement}`);
    });
    const appRoot = `apps/${s.targetApp}`;
    s.targetPaths.forEach((p, i) => {
      if (!isWithinPath(p, appRoot) || p === appRoot)
        issue(['targetPaths', i], `${p} is outside ${appRoot}/`);
    });
  });
export type SpecDocument = z.infer<typeof SpecDocument>;

/** Parses untrusted spec input. Never throws for bad input. */
export function parseSpec(input: unknown): Validated<SpecDocument> {
  const r = SpecDocument.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, issues: zodIssues(r.error) };
}
