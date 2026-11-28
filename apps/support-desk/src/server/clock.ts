/**
 * The app's clock (task P6-02). SLA code never reads time on its own: actions take
 * `clock.now()` here, and the pure functions in `src/sla` take the time as an argument.
 * Tests replace it with `setClock` and restore it with `resetClock`.
 */
export interface Clock {
  now(): Date;
}

const systemClock: Clock = { now: () => new Date() };
let current: Clock = systemClock;

export const clock: Clock = { now: () => current.now() };

export function setClock(next: Clock): void {
  current = next;
}

export function resetClock(): void {
  current = systemClock;
}
