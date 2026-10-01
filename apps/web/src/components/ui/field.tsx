import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cx } from '@/lib/cx';

const CONTROL =
  'w-full min-h-11 rounded-input border bg-surface px-3 text-body text-content placeholder:text-content-muted ' +
  'disabled:bg-disabled disabled:text-disabled-content';

interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

/** Label sempre visível, dica e erro associados ao controle (DESIGN.md §6.5, §12). */
function FieldShell({ id, label, hint, error, required, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label font-medium text-content">
        {label}
        {required ? <span className="text-content-muted"> (obrigatório)</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-caption text-content-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1 text-caption text-error">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string;
  ref?: React.Ref<HTMLInputElement>;
}

export function TextField({
  label,
  hint,
  error,
  required,
  className,
  ref,
  ...props
}: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <input
        id={id}
        ref={ref}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, error ? 'border-error' : 'border-line-strong', className)}
        {...props}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string;
  ref?: React.Ref<HTMLSelectElement>;
  children: ReactNode;
}

export function SelectField({
  label,
  hint,
  error,
  required,
  className,
  ref,
  children,
  ...props
}: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <select
        id={id}
        ref={ref}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, error ? 'border-error' : 'border-line-strong', className)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}
