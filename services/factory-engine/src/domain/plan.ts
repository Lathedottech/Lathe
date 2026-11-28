import { PlanTask } from '@lathe/shared-contracts';
import { z } from 'zod';
import { isWithinPath, type SpecDocument } from './spec.js';
import { zodIssues, type ValidationIssue, type Validated } from './validated.js';

/** A plan as the planner agent proposes it: tasks only. Ids, hashes and status are the Engine's. */
export const PlanDraft = z.strictObject({ tasks: z.array(PlanTask).min(1).max(50) });
export type PlanDraft = z.infer<typeof PlanDraft>;

/** Task keys in an order where every task comes after its dependencies, or null if there is a cycle. */
export function executionOrder(
  tasks: readonly { key: string; dependsOn: readonly string[] }[],
): string[] | null {
  const remaining = new Map(tasks.map((t) => [t.key, new Set(t.dependsOn)]));
  const order: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter(([, deps]) => [...deps].every((d) => !remaining.has(d)))
      .map(([k]) => k)
      .sort();
    if (ready.length === 0) return null;
    for (const k of ready) {
      order.push(k);
      remaining.delete(k);
    }
  }
  return order;
}

/**
 * Validates an untrusted plan against its spec (task P3-01): schema, unique
 * keys, known dependencies, no self or circular dependencies, and every task
 * path inside one of the spec's target paths.
 */
export function validatePlan(input: unknown, spec: SpecDocument): Validated<PlanDraft> {
  const parsed = PlanDraft.safeParse(input);
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) };
  const { tasks } = parsed.data;
  const issues: ValidationIssue[] = [];
  const keys = tasks.map((t) => t.key);
  tasks.forEach((t, i) => {
    if (keys.indexOf(t.key) !== i)
      issues.push({ path: `tasks.${i}.key`, message: `duplicate task ${t.key}` });
    t.dependsOn.forEach((d, j) => {
      if (d === t.key)
        issues.push({ path: `tasks.${i}.dependsOn.${j}`, message: `${t.key} depends on itself` });
      else if (!keys.includes(d))
        issues.push({
          path: `tasks.${i}.dependsOn.${j}`,
          message: `${t.key} depends on unknown task ${d}`,
        });
    });
    t.paths.forEach((p, j) => {
      if (!spec.targetPaths.some((tp) => isWithinPath(p, tp)))
        issues.push({
          path: `tasks.${i}.paths.${j}`,
          message: `${p} is outside the spec's target paths`,
        });
    });
  });
  if (issues.length === 0 && executionOrder(tasks) === null)
    issues.push({ path: 'tasks', message: 'tasks have a circular dependency' });
  return issues.length === 0 ? { ok: true, value: parsed.data } : { ok: false, issues };
}
