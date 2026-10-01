import { PatientUploadLinkStatus } from './enums.js';

/** Status persistido no banco (EXPIRED nunca é gravado). */
export type PersistedLinkStatus = 'ACTIVE' | 'USED' | 'REVOKED';

/**
 * Deriva o status exibido a partir do status persistido e de `expiresAt`, na
 * leitura — sem depender de job (PRD §17.4). Utilizado e revogado prevalecem
 * sobre a expiração.
 */
export function deriveLinkStatus(
  link: { status: PersistedLinkStatus; expiresAt: Date | string },
  now: Date = new Date(),
): PatientUploadLinkStatus {
  if (link.status === 'USED') return PatientUploadLinkStatus.USED;
  if (link.status === 'REVOKED') return PatientUploadLinkStatus.REVOKED;
  return new Date(link.expiresAt).getTime() <= now.getTime()
    ? PatientUploadLinkStatus.EXPIRED
    : PatientUploadLinkStatus.ACTIVE;
}
