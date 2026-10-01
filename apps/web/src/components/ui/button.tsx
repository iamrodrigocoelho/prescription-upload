import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'destructive';
type Size = 'md' | 'sm';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active',
  secondary: 'bg-surface text-content border border-line-strong hover:bg-hover active:bg-selected',
  tertiary: 'bg-transparent text-link underline-offset-4 hover:underline hover:bg-hover',
  destructive: 'bg-error text-content-inverse hover:opacity-90 active:opacity-80',
};

const SIZES: Record<Size, string> = {
  md: 'min-h-11 px-4 text-button',
  sm: 'min-h-9 px-3 text-body-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-button font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-content disabled:border-transparent disabled:no-underline',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
