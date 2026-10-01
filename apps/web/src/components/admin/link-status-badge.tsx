import type { PatientUploadLinkStatus } from '@receita/shared';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { LINK_STATUS_LABELS } from '@/lib/labels';

const TONE: Record<PatientUploadLinkStatus, BadgeTone> = {
  ACTIVE: 'success',
  USED: 'info',
  EXPIRED: 'warning',
  REVOKED: 'error',
};

/** Ativo, Utilizado, Expirado ou Revogado — sempre cor + ícone + texto (DESIGN.md §8.7). */
export function LinkStatusBadge({ status }: { status: PatientUploadLinkStatus }) {
  return <StatusBadge tone={TONE[status]} label={LINK_STATUS_LABELS[status]} />;
}
