import type { EngineCapability } from './capability.js';
import { RunStateError } from './errors.js';
import {
  nextActionFor,
  nextSnapshot,
  type NextAction,
  type RunSnapshot,
  type RunState,
} from './state-machine.js';

export interface RunEventDraft {
  readonly type: 'state_changed';
  readonly payload: {
    readonly from: RunState;
    readonly to: RunState;
    readonly repairAttempts: number;
    readonly reason?: string;
  };
}

export interface TransitionDecision {
  readonly next: RunSnapshot;
  readonly event: RunEventDraft;
}

/**
 * Persistence port. `transition` must load the run (locking it), call `decide`,
 * and write the new snapshot plus the event atomically. If `decide` throws,
 * nothing is written. Org scoping is inside the implementation.
 */
export interface RunStore {
  transition(
    runId: string,
    decide: (current: RunSnapshot) => TransitionDecision,
  ): Promise<RunSnapshot>;
  listNonTerminal(): Promise<readonly RunSnapshot[]>;
}

export interface TransitionOptions {
  readonly capability?: EngineCapability;
  /** Short operator-facing note, stored in the event. Never put secrets here. */
  readonly reason?: string;
}

export async function transitionRun(
  store: RunStore,
  runId: string,
  to: RunState,
  options: TransitionOptions = {},
): Promise<RunSnapshot> {
  const reason = options.reason?.slice(0, 200);
  return store.transition(runId, (current) => {
    const next = nextSnapshot(current, to, options.capability);
    return {
      next,
      event: {
        type: 'state_changed',
        payload: {
          from: current.state,
          to,
          repairAttempts: next.repairAttempts,
          ...(reason === undefined ? {} : { reason }),
        },
      },
    };
  });
}

export interface ResumeItem {
  readonly runId: string;
  readonly state: RunState;
  readonly repairAttempts: number;
  readonly action: NextAction;
}

/** After a restart: every non-terminal run with the action the Engine must take next. */
export async function resumeRuns(store: RunStore): Promise<readonly ResumeItem[]> {
  const runs = await store.listNonTerminal();
  const items: ResumeItem[] = [];
  for (const run of runs) {
    if (run.state === 'DELIVERED' || run.state === 'FAILED' || run.state === 'CANCELLED') continue;
    items.push({ ...run, action: nextActionFor(run.state) });
  }
  return items;
}

export { RunStateError };
