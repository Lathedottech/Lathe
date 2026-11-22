import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './table.module.css';

export interface Column<Row> {
  readonly key: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  readonly align?: 'start' | 'end';
}

export interface TableProps<Row> {
  /** Visible caption; also names the table for screen readers. */
  readonly caption: string;
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  /** Shown in place of the body when `rows` is empty. Use an `EmptyState`. */
  readonly empty: ReactNode;
  readonly className?: string;
}

/** Data table with real `<th scope="col">` headers. Scrolls horizontally on narrow screens. */
export function Table<Row>({ caption, columns, rows, rowKey, empty, className }: TableProps<Row>) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div className={cx(styles.wrap, className)} tabIndex={0} role="region" aria-label={caption}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx(c.align === 'end' && styles.end)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={cx(c.align === 'end' && styles.end)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
