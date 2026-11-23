import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './nav.module.css';

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon?: ReactNode;
}

export interface SideNavProps {
  readonly label: string;
  readonly items: readonly NavItem[];
  /** The current path; the matching item gets `aria-current="page"`. */
  readonly current: string;
  readonly collapsed?: boolean;
  readonly className?: string;
}

function isCurrent(href: string, current: string): boolean {
  return current === href || (href !== '/' && current.startsWith(`${href}/`));
}

/**
 * Sidebar navigation (Workspace shell, P9-02). Plain links, so keyboard and
 * screen readers work without script. Collapsed shows icons with the label kept
 * for screen readers.
 */
export function SideNav({ label, items, current, collapsed = false, className }: SideNavProps) {
  return (
    <nav aria-label={label} className={cx(styles.side, collapsed && styles.collapsed, className)}>
      <ul className={styles.list}>
        {items.map((item) => {
          const active = isCurrent(item.href, current);
          return (
            <li key={item.href}>
              <a
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(styles.link, active && styles.active)}
                title={collapsed ? item.label : undefined}
              >
                {item.icon && (
                  <span className={styles.icon} aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                <span className={collapsed ? 'visually-hidden' : undefined}>{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export interface TopNavProps {
  readonly label: string;
  readonly items: readonly NavItem[];
  readonly brand: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}

/** Horizontal navigation (landing page, P9-01). */
export function TopNav({ label, items, brand, actions, className }: TopNavProps) {
  return (
    <header className={cx(styles.top, className)}>
      <div className={styles.brand}>{brand}</div>
      <nav aria-label={label}>
        <ul className={styles.topList}>
          {items.map((item) => (
            <li key={item.href}>
              <a href={item.href} className={styles.topLink}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
