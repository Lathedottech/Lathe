'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';
import styles from './tabs.module.css';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

export interface TabsProps {
  /** Names the tab list for screen readers. */
  readonly label: string;
  readonly items: readonly TabItem[];
  readonly defaultTab?: string;
  readonly onChange?: (id: string) => void;
  readonly className?: string;
}

/**
 * WAI-ARIA tabs with automatic activation: Left/Right move between tabs
 * (wrapping), Home/End jump to the first/last. Only the selected tab is in the
 * tab order, so Tab moves into the panel.
 */
export function Tabs({ label, items, defaultTab, onChange, className }: TabsProps) {
  const base = useId();
  const [selected, setSelected] = useState(defaultTab ?? items[0]?.id ?? '');
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const item = items[index];
    if (!item) return;
    setSelected(item.id);
    onChange?.(item.id);
    refs.current[index]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    select(next);
  };

  return (
    <div className={cx(styles.tabs, className)}>
      <div role="tablist" aria-label={label} className={styles.list}>
        {items.map((item, i) => {
          const isSelected = item.id === selected;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.id}`}
              aria-selected={isSelected}
              aria-controls={`${base}-panel-${item.id}`}
              tabIndex={isSelected ? 0 : -1}
              className={cx(styles.tab, isSelected && styles.selected)}
              onClick={() => select(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${base}-panel-${item.id}`}
          aria-labelledby={`${base}-tab-${item.id}`}
          hidden={item.id !== selected}
          tabIndex={0}
          className={styles.panel}
        >
          {item.id === selected && item.content}
        </div>
      ))}
    </div>
  );
}
