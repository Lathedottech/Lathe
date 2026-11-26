import type { GateStatus, OverallStatus, RunState } from '@lathe/shared-contracts';
import { cx } from './cx';
import styles from './status-chip.module.css';

export type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

/** Every Engine status the UI shows. Typed from contracts C3 and C4, so a new state fails typecheck here. */
export type Status = RunState | GateStatus | OverallStatus;

const STATUS: Readonly<Record<Status, { tone: Tone; label: string; symbol: string }>> = {
  DEFINED: { tone: 'neutral', label: 'Defined', symbol: '○' },
  PLANNED: { tone: 'neutral', label: 'Planned', symbol: '○' },
  BUILDING: { tone: 'info', label: 'Building', symbol: '●' },
  VERIFYING: { tone: 'info', label: 'Verifying', symbol: '●' },
  REPAIRING: { tone: 'warning', label: 'Repairing', symbol: '●' },
  AWAITING_APPROVAL: { tone: 'warning', label: 'Awaiting approval', symbol: '◆' },
  DELIVERED: { tone: 'success', label: 'Delivered', symbol: '✓' },
  FAILED: { tone: 'danger', label: 'Failed', symbol: '✕' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled', symbol: '–' },
  passed: { tone: 'success', label: 'Passed', symbol: '✓' },
  failed: { tone: 'danger', label: 'Failed', symbol: '✕' },
  error: { tone: 'danger', label: 'Error', symbol: '!' },
  not_run: { tone: 'neutral', label: 'Not run', symbol: '–' },
};

export interface StatusChipProps {
  readonly status: Status;
  readonly className?: string;
}

/**
 * Shows a run state or gate result. The text label is always present and a
 * distinct symbol is shown too, so color is never the only signal (WCAG 1.4.1).
 */
export function StatusChip({ status, className }: StatusChipProps) {
  const s = STATUS[status];
  return (
    <span className={cx(styles.chip, styles[s.tone], className)} data-tone={s.tone}>
      <span aria-hidden="true">{s.symbol}</span>
      {s.label}
    </span>
  );
}

export function toneOf(status: Status): Tone {
  return STATUS[status].tone;
}
