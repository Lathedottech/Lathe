import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from './cx';
import styles from './form.module.css';

interface FieldProps {
  /** Visible label. Every control has one; placeholders are not labels. */
  readonly label: string;
  readonly hint?: string;
  /** Validation message. Sets `aria-invalid` and is announced with the control. */
  readonly error?: string;
}

/** Wires a label, hint and error to one control by id. */
function useField(id: string | undefined, hint?: string, error?: string) {
  const auto = useId();
  const controlId = id ?? auto;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return { controlId, hintId, errorId, describedBy };
}

function Messages(p: {
  hint: string | undefined;
  hintId: string | undefined;
  error: string | undefined;
  errorId: string | undefined;
}) {
  return (
    <>
      {p.hint && (
        <span id={p.hintId} className={styles.hint}>
          {p.hint}
        </span>
      )}
      {p.error && (
        <span id={p.errorId} className={styles.error} role="alert">
          {p.error}
        </span>
      )}
    </>
  );
}

export type TextFieldProps = FieldProps & InputHTMLAttributes<HTMLInputElement>;

export function TextField({ label, hint, error, id, className, ...rest }: TextFieldProps) {
  const f = useField(id, hint, error);
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={f.controlId} className={styles.label}>
        {label}
      </label>
      <input
        {...rest}
        id={f.controlId}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={f.describedBy}
      />
      <Messages hint={hint} hintId={f.hintId} error={error} errorId={f.errorId} />
    </div>
  );
}

export type TextAreaProps = FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({ label, hint, error, id, className, ...rest }: TextAreaProps) {
  const f = useField(id, hint, error);
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={f.controlId} className={styles.label}>
        {label}
      </label>
      <textarea
        {...rest}
        id={f.controlId}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={f.describedBy}
      />
      <Messages hint={hint} hintId={f.hintId} error={error} errorId={f.errorId} />
    </div>
  );
}

export type SelectProps = FieldProps &
  SelectHTMLAttributes<HTMLSelectElement> & { readonly children: ReactNode };

/** Native select: keyboard and screen-reader behaviour come from the browser. */
export function Select({ label, hint, error, id, className, children, ...rest }: SelectProps) {
  const f = useField(id, hint, error);
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={f.controlId} className={styles.label}>
        {label}
      </label>
      <select
        {...rest}
        id={f.controlId}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={f.describedBy}
      >
        {children}
      </select>
      <Messages hint={hint} hintId={f.hintId} error={error} errorId={f.errorId} />
    </div>
  );
}

export type CheckboxProps = { readonly label: string } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
>;

export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label className={cx(styles.check, className)}>
      <input {...rest} type="checkbox" />
      {label}
    </label>
  );
}
