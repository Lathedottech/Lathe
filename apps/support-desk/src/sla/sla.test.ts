import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TICKET_PRIORITIES } from '../server/schema';
import { AT_RISK_RATIO, SLA_POLICY } from './policy';
import { computeSla, dueTimes, targetStatus, type TargetStatus } from './sla';

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 10, 25, 9, 0, 0);
const RUNS = { numRuns: 2000 };

const priority = fc.constantFrom(...TICKET_PRIORITIES);
const opened = fc.integer({ min: T0, max: T0 + 365 * 24 * HOUR }).map((t) => new Date(t));
/** A fake clock: any offset from -1 h to +30 days after opening. */
const offset = fc.integer({ min: -HOUR, max: 30 * 24 * HOUR });
const maybeDone = fc.option(fc.integer({ min: 0, max: 30 * 24 * HOUR }), { nil: null });

describe('SLA properties (fake clock)', () => {
  it('due times are after opening, and resolution is never due before first response', () => {
    fc.assert(
      fc.property(opened, priority, (o, p) => {
        const d = dueTimes(o, p);
        expect(d.firstResponseDueAt.getTime()).toBeGreaterThan(o.getTime());
        expect(d.resolutionDueAt.getTime()).toBeGreaterThanOrEqual(d.firstResponseDueAt.getTime());
      }),
      RUNS,
    );
  });

  it('a higher priority is never given more time than a lower one', () => {
    const order = ['urgent', 'high', 'normal', 'low'] as const;
    for (let i = 1; i < order.length; i += 1) {
      const a = SLA_POLICY[order[i - 1] ?? 'urgent'];
      const b = SLA_POLICY[order[i] ?? 'low'];
      expect(a.firstResponseMs).toBeLessThanOrEqual(b.firstResponseMs);
      expect(a.resolutionMs).toBeLessThanOrEqual(b.resolutionMs);
    }
  });

  it('a done target is met exactly when it happened at or before the due time, whatever the clock', () => {
    fc.assert(
      fc.property(
        opened,
        priority,
        fc.integer({ min: 0, max: 30 * 24 * HOUR }),
        offset,
        (o, p, d, n) => {
          const due = dueTimes(o, p).firstResponseDueAt;
          const done = new Date(o.getTime() + d);
          const status = targetStatus(o, due, done, new Date(o.getTime() + n));
          expect(status).toBe(done.getTime() <= due.getTime() ? 'met' : 'missed');
        },
      ),
      RUNS,
    );
  });

  it('an open target is breached exactly when the clock is past the due time', () => {
    fc.assert(
      fc.property(opened, priority, offset, (o, p, n) => {
        const due = dueTimes(o, p).resolutionDueAt;
        const now = new Date(o.getTime() + n);
        const status = targetStatus(o, due, null, now);
        expect(status === 'breached').toBe(now.getTime() > due.getTime());
      }),
      RUNS,
    );
  });

  it('moving the clock forward never improves an open target', () => {
    const rank: Record<TargetStatus, number> = {
      met: 0,
      missed: 0,
      on_track: 1,
      at_risk: 2,
      breached: 3,
    };
    fc.assert(
      fc.property(opened, priority, offset, fc.nat(30 * 24 * HOUR), (o, p, n, later) => {
        const due = dueTimes(o, p).firstResponseDueAt;
        const a = targetStatus(o, due, null, new Date(o.getTime() + n));
        const b = targetStatus(o, due, null, new Date(o.getTime() + n + later));
        expect(rank[b]).toBeGreaterThanOrEqual(rank[a]);
      }),
      RUNS,
    );
  });

  it('at_risk starts at the configured share of the window, and only before the due time', () => {
    fc.assert(
      fc.property(opened, priority, offset, (o, p, n) => {
        const due = dueTimes(o, p).resolutionDueAt;
        const now = new Date(o.getTime() + n);
        const status = targetStatus(o, due, null, now);
        const window = due.getTime() - o.getTime();
        const elapsed = now.getTime() - o.getTime();
        if (status === 'at_risk') {
          expect(elapsed).toBeGreaterThanOrEqual(window * AT_RISK_RATIO);
          expect(now.getTime()).toBeLessThanOrEqual(due.getTime());
        }
        if (status === 'on_track') expect(elapsed).toBeLessThan(window * AT_RISK_RATIO);
      }),
      RUNS,
    );
  });

  it('overall is always the worse of the two targets', () => {
    fc.assert(
      fc.property(opened, priority, maybeDone, maybeDone, offset, (o, p, fr, rs, n) => {
        const d = dueTimes(o, p);
        const sla = computeSla(
          {
            openedAt: o,
            ...d,
            firstResponseAt: fr === null ? null : new Date(o.getTime() + fr),
            resolvedAt: rs === null ? null : new Date(o.getTime() + rs),
          },
          new Date(o.getTime() + n),
        );
        expect([sla.firstResponse, sla.resolution]).toContain(sla.overall);
        if (sla.firstResponse === 'breached' || sla.resolution === 'breached')
          expect(sla.overall).toBe('breached');
      }),
      RUNS,
    );
  });
});

describe('SLA examples', () => {
  const o = new Date(T0);
  const due = dueTimes(o, 'urgent');

  it('urgent: first response due in 1 h, resolution in 4 h', () => {
    expect(due.firstResponseDueAt.getTime() - T0).toBe(HOUR);
    expect(due.resolutionDueAt.getTime() - T0).toBe(4 * HOUR);
  });

  it('exactly at the due time is still on time; one millisecond later is breached', () => {
    const at = due.firstResponseDueAt;
    expect(targetStatus(o, at, null, at)).toBe('at_risk');
    expect(targetStatus(o, at, null, new Date(at.getTime() + 1))).toBe('breached');
    expect(targetStatus(o, at, at, new Date(at.getTime() + HOUR))).toBe('met');
    expect(targetStatus(o, at, new Date(at.getTime() + 1), at)).toBe('missed');
  });

  it('at 45 minutes an urgent first response is at risk, at 44 it is on track', () => {
    expect(targetStatus(o, due.firstResponseDueAt, null, new Date(T0 + 44 * 60_000))).toBe(
      'on_track',
    );
    expect(targetStatus(o, due.firstResponseDueAt, null, new Date(T0 + 45 * 60_000))).toBe(
      'at_risk',
    );
  });
});
