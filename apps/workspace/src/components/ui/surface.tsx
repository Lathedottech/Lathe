import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './surface.module.css';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  readonly title?: string;
  /** Heading level of `title`, to keep the page outline correct. Default 2. */
  readonly level?: 2 | 3 | 4;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/** A raised section. With a `title` it renders as a labelled `<section>`. */
export function Card({ title, level = 2, actions, className, children, ...rest }: CardProps) {
  const Heading = `h${level}` as const;
  const content = (
    <>
      {(title || actions) && (
        <div className={styles.header}>
          {title && <Heading className={styles.title}>{title}</Heading>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </>
  );
  return title ? (
    <section {...rest} className={cx(styles.card, className)}>
      {content}
    </section>
  ) : (
    <div {...rest} className={cx(styles.card, className)}>
      {content}
    </div>
  );
}

export type BadgeTone = 'neutral' | 'accent';

/** Small static label (a count, a version, "draft"). For states use `StatusChip`. */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={cx(styles.badge, styles[tone])}>{children}</span>;
}

export interface StatProps {
  readonly label: string;
  /** A real number from the Engine. `null` means not loaded: shows an em dash, never 0. */
  readonly value: number | null;
  readonly detail?: string;
}

/** One dashboard number (P9-03). */
export function Stat({ label, value, detail }: StatProps) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value === null ? '—' : value}</span>
      {detail && <span className={styles.statDetail}>{detail}</span>}
    </div>
  );
}
