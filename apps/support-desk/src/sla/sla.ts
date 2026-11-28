import type { TicketPriority } from '../server/schema';
import { AT_RISK_RATIO, SLA_POLICY } from './policy';

/**
 * SLA computation (task P6-02). Pure: every function takes the current time as an
 * argument and never reads a clock, so it can be tested with any fake time.
 *
 * One target (first response or resolution) is, at time `now`:
 *   - met: the event happened at or before the due time;
 *   - missed: the event happened after the due time;
 *   - breached: no event yet, and `now` is past the due time;
 *   - at_risk: no event yet, `AT_RISK_RATIO` of the window has passed, not yet due;
 *   - on_track: no event yet, earlier than that.
 */
export type TargetStatus = 'met' | 'missed' | 'breached' | 'at_risk' | 'on_track';

export interface DueTimes {
  readonly firstResponseDueAt: Date;
  readonly resolutionDueAt: Date;
}

export function dueTimes(openedAt: Date, priority: TicketPriority): DueTimes {
  const target = SLA_POLICY[priority];
  const t = openedAt.getTime();
  return {
    firstResponseDueAt: new Date(t + target.firstResponseMs),
    resolutionDueAt: new Date(t + target.resolutionMs),
  };
}

export function targetStatus(
  openedAt: Date,
  dueAt: Date,
  doneAt: Date | null,
  now: Date,
): TargetStatus {
  const due = dueAt.getTime();
  if (doneAt !== null) return doneAt.getTime() <= due ? 'met' : 'missed';
  const at = now.getTime();
  if (at > due) return 'breached';
  const start = openedAt.getTime();
  return at - start >= (due - start) * AT_RISK_RATIO ? 'at_risk' : 'on_track';
}

export interface SlaInput {
  readonly openedAt: Date;
  readonly firstResponseDueAt: Date;
  readonly resolutionDueAt: Date;
  readonly firstResponseAt: Date | null;
  readonly resolvedAt: Date | null;
}

export interface Sla {
  readonly firstResponse: TargetStatus;
  readonly resolution: TargetStatus;
  readonly firstResponseDueAt: string;
  readonly resolutionDueAt: string;
  /** The worse of the two, for badges and filters. */
  readonly overall: TargetStatus;
}

const SEVERITY: Readonly<Record<TargetStatus, number>> = {
  met: 0,
  on_track: 1,
  at_risk: 2,
  missed: 3,
  breached: 4,
};

export const worse = (a: TargetStatus, b: TargetStatus): TargetStatus =>
  SEVERITY[a] >= SEVERITY[b] ? a : b;

export function computeSla(t: SlaInput, now: Date): Sla {
  const firstResponse = targetStatus(t.openedAt, t.firstResponseDueAt, t.firstResponseAt, now);
  const resolution = targetStatus(t.openedAt, t.resolutionDueAt, t.resolvedAt, now);
  return {
    firstResponse,
    resolution,
    firstResponseDueAt: t.firstResponseDueAt.toISOString(),
    resolutionDueAt: t.resolutionDueAt.toISOString(),
    overall: worse(firstResponse, resolution),
  };
}
