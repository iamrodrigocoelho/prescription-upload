import {
  IDENTIFICATION_STATUS_LABELS,
  type IdentificationStatus,
  OPERATIONAL_STATUS_LABELS,
  type OperationalStatus,
} from '@receita/shared';
import { CircleDot, Hourglass, PlayCircle, Search, UserCheck, UserX } from 'lucide-react';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';

const OPERATIONAL_TONE: Record<OperationalStatus, BadgeTone> = {
  RECEIVED: 'info',
  IN_REVIEW: 'warning',
  IN_SERVICE: 'warning',
  FINISHED: 'success',
  CANCELLED: 'error',
  NOT_SERVED: 'neutral',
};

const OPERATIONAL_ICON = {
  RECEIVED: CircleDot,
  IN_REVIEW: Search,
  IN_SERVICE: PlayCircle,
} as const;

/** Status como chip com texto explícito (DESIGN §8.3). */
export function OperationalBadge({ status }: { status: OperationalStatus }) {
  const icon =
    status in OPERATIONAL_ICON
      ? OPERATIONAL_ICON[status as keyof typeof OPERATIONAL_ICON]
      : undefined;
  return (
    <StatusBadge
      tone={OPERATIONAL_TONE[status]}
      label={OPERATIONAL_STATUS_LABELS[status]}
      icon={icon}
    />
  );
}

export function IdentificationBadge({ status }: { status: IdentificationStatus }) {
  return status === 'NOT_IDENTIFIED' ? (
    <StatusBadge tone="warning" label={IDENTIFICATION_STATUS_LABELS[status]} icon={UserX} />
  ) : (
    <StatusBadge tone="success" label={IDENTIFICATION_STATUS_LABELS[status]} icon={UserCheck} />
  );
}

/** Nova/não visualizada: marcador + texto, nunca só cor. */
export function NewBadge() {
  return <StatusBadge tone="info" label="Nova" icon={Hourglass} />;
}
