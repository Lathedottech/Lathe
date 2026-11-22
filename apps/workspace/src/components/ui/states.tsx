import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './states.module.css';

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  /** The action that creates what is missing, only if the user may perform it. */
  readonly action?: ReactNode;
  readonly className?: string;
}

/** Nothing to show yet. Never filled with sample data. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx(styles.state, className)}>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

/** Data is on its way. Announced politely; shows no fake numbers. */
export function LoadingState({
  label = 'Loading',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cx(styles.state, className)}>
      <span className={styles.spinner} aria-hidden="true" />
      <p className={styles.description}>{label}…</p>
    </div>
  );
}

export interface ErrorStateProps {
  readonly title?: string;
  /** The API error `message`. Never a stack trace or SQL (the API never sends them). */
  readonly message: string;
  /** The API error `requestId`, so a user can report it. */
  readonly requestId?: string;
  readonly action?: ReactNode;
  readonly className?: string;
}

/** Something failed. Announced immediately. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  requestId,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={cx(styles.state, styles.error, className)}>
      <p className={styles.title}>{title}</p>
      <p className={styles.description}>{message}</p>
      {requestId && (
        <p className={styles.meta}>
          Request ID: <code>{requestId}</code>
        </p>
      )}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
