import { cx } from './cx';
import styles from './code-block.module.css';

export interface CodeBlockProps {
  /** Untrusted text (agent output, logs, gate output). Always rendered as text, never as HTML. */
  readonly text: string;
  readonly label: string;
  /** Lines kept from the end; earlier ones are dropped with a notice. Default 2000. */
  readonly maxLines?: number;
  readonly className?: string;
}

/** Monospace block for logs and agent output. Scrolls; never interprets markup. */
export function CodeBlock({ text, label, maxLines = 2000, className }: CodeBlockProps) {
  const lines = text.split('\n');
  const dropped = Math.max(0, lines.length - maxLines);
  const shown = dropped > 0 ? lines.slice(dropped).join('\n') : text;
  return (
    <figure className={cx(styles.figure, className)}>
      <figcaption className={styles.caption}>{label}</figcaption>
      {dropped > 0 && <p className={styles.notice}>{dropped} earlier lines not shown</p>}
      <pre className={styles.pre} tabIndex={0}>
        <code>{shown}</code>
      </pre>
    </figure>
  );
}

export interface DiffBlockProps {
  /** A unified diff (`git diff` text). Untrusted: rendered as text. */
  readonly diff: string;
  readonly label: string;
  readonly className?: string;
}

function lineKind(line: string): 'add' | 'remove' | 'hunk' | 'meta' | 'context' {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git'))
    return 'meta';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'remove';
  return 'context';
}

const SIGN: Record<ReturnType<typeof lineKind>, string> = {
  add: 'added',
  remove: 'removed',
  hunk: 'hunk',
  meta: 'file',
  context: '',
};

/**
 * Unified diff with added and removed lines marked by color **and** by the
 * `+`/`-` sign plus a screen-reader label, so color is never the only signal.
 */
export function DiffBlock({ diff, label, className }: DiffBlockProps) {
  const lines = diff.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return (
    <figure className={cx(styles.figure, className)}>
      <figcaption className={styles.caption}>{label}</figcaption>
      <pre className={styles.pre} tabIndex={0}>
        <code>
          {lines.map((line, i) => {
            const kind = lineKind(line);
            return (
              <span key={i} className={cx(styles.line, styles[kind])} data-kind={kind}>
                {SIGN[kind] && <span className="visually-hidden">{SIGN[kind]}: </span>}
                {line}
                {'\n'}
              </span>
            );
          })}
        </code>
      </pre>
    </figure>
  );
}
