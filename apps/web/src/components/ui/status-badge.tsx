import { Ban, CheckCircle2, Circle, Clock, type LucideIcon, XCircle } from 'lucide-react';
import { cx } from '@/lib/cx';

export type BadgeTone = 'success' | 'warning' | 'error' | 'neutral' | 'info';

const TONES: Record<BadgeTone, string> = {
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  error: 'bg-error-subtle text-error',
  info: 'bg-info-subtle text-info',
  neutral: 'bg-subtle text-content-secondary',
};

const ICONS: Record<BadgeTone, LucideIcon> = {
  success: CheckCircle2,
  warning: Clock,
  error: XCircle,
  info: Circle,
  neutral: Ban,
};

/** Status como chip: cor + ícone + texto explícito (DESIGN.md §8.3, §8.7). */
export function StatusBadge({
  tone,
  label,
  icon,
}: {
  tone: BadgeTone;
  label: string;
  icon?: LucideIcon;
}) {
  const Icon = icon ?? ICONS[tone];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-button px-2 py-0.5 text-caption font-semibold whitespace-nowrap',
        TONES[tone],
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
