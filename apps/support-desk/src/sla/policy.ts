import type { TicketPriority } from '../server/schema';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface SlaTarget {
  /** Time from opening to the first public staff reply. */
  readonly firstResponseMs: number;
  /** Time from opening to resolved (or closed). */
  readonly resolutionMs: number;
}

/**
 * Support Desk SLA policy (task P6-02). Wall-clock time: no business hours, no pause
 * while a ticket is pending. A change of priority recomputes both due times from the
 * time the ticket was opened.
 */
export const SLA_POLICY: Readonly<Record<TicketPriority, SlaTarget>> = {
  urgent: { firstResponseMs: 1 * HOUR, resolutionMs: 4 * HOUR },
  high: { firstResponseMs: 4 * HOUR, resolutionMs: 1 * DAY },
  normal: { firstResponseMs: 1 * DAY, resolutionMs: 3 * DAY },
  low: { firstResponseMs: 2 * DAY, resolutionMs: 7 * DAY },
};

/** A due time is "at risk" once this share of its window has passed. */
export const AT_RISK_RATIO = 0.75;
