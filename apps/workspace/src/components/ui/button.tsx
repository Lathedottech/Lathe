import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: 'sm' | 'md';
  /** Shows the action is running: the button is disabled and announced as busy. */
  readonly busy?: boolean;
  readonly children: ReactNode;
}

/**
 * Buttons perform actions. Use a link for navigation. One `primary` per view.
 * `type` defaults to `button`, so a button never submits a form by accident.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled === true || busy}
      aria-busy={busy || undefined}
      className={cx(styles.button, styles[variant], styles[size], className)}
    >
      {children}
    </button>
  );
}
