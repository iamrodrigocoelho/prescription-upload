import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Tone = 'success' | 'warning' | 'error' | 'info';

const TONES: Record<Tone, { box: string; Icon: typeof Info }> = {
  success: { box: 'bg-success-subtle text-success border-success', Icon: CheckCircle2 },
  warning: { box: 'bg-warning-subtle text-warning border-warning', Icon: TriangleAlert },
  error: { box: 'bg-error-subtle text-error border-error', Icon: AlertCircle },
  info: { box: 'bg-info-subtle text-info border-line', Icon: Info },
};

/** Alerta de contexto: ícone + texto, nunca só cor (DESIGN.md §7). */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
  ref,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const { box, Icon } = TONES[tone];
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('flex gap-3 rounded-card border p-3 text-body-sm', box, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex flex-col gap-1 text-content">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
