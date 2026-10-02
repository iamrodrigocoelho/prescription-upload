import { AuditAction, isReopen, type OperationalStatus, type TimelineEntry } from '@receita/shared';

export interface TimelineInput {
  receivedAt: Date;
  statusHistory: {
    id: string;
    createdAt: Date;
    fromStatus: OperationalStatus | null;
    toStatus: OperationalStatus;
    actorName: string | null;
  }[];
  patientLinks: { id: string; createdAt: Date; linkType: string; actorName: string | null }[];
  audits: {
    id: string;
    createdAt: Date;
    action: string;
    entityId: string | null;
    actorName: string | null;
    metadata: unknown;
  }[];
  /** IDs dos anexos na ordem de exibição (para "Arquivo 1", "Arquivo 2"...). */
  fileIds: string[];
}

const AUDIT_TYPES: Partial<Record<string, TimelineEntry['type']>> = {
  [AuditAction.PRESCRIPTION_FIRST_VIEWED]: 'first_viewed',
  [AuditAction.PRESCRIPTION_FILE_VIEWED]: 'file_viewed',
  [AuditAction.PRESCRIPTION_FILE_DOWNLOADED]: 'file_downloaded',
  [AuditAction.PRESCRIPTION_CPF_REVEALED]: 'cpf_revealed',
};

/**
 * Linha do tempo do detalhe (DESIGN §8.4, §13.6) a partir de StatusHistory,
 * PatientLinkHistory e eventos de auditoria relevantes. Nunca inclui IP,
 * metadados técnicos, tokens ou nomes de arquivo — apenas tipo, horário,
 * responsável e, quando cabível, status ou posição do anexo.
 */
export function buildTimeline(input: TimelineInput): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const row of input.statusHistory) {
    if (row.fromStatus === null) {
      entries.push({
        id: row.id,
        at: row.createdAt.toISOString(),
        type: 'received',
        actorName: null,
      });
      continue;
    }
    entries.push({
      id: row.id,
      at: row.createdAt.toISOString(),
      type: isReopen(row.fromStatus, row.toStatus) ? 'reopened' : 'status_changed',
      actorName: row.actorName,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
    });
  }
  if (!input.statusHistory.some((row) => row.fromStatus === null)) {
    entries.push({
      id: 'received',
      at: input.receivedAt.toISOString(),
      type: 'received',
      actorName: null,
    });
  }

  for (const link of input.patientLinks) {
    entries.push({
      id: link.id,
      at: link.createdAt.toISOString(),
      type: 'patient_linked',
      actorName: link.actorName,
      linkType: link.linkType,
    });
  }

  for (const audit of input.audits) {
    const type = AUDIT_TYPES[audit.action];
    if (!type) continue;
    const variant = (audit.metadata as { variant?: unknown } | null)?.variant;
    // Miniaturas carregam automaticamente: auditadas, mas fora da linha do tempo.
    if (type === 'file_viewed' && variant === 'thumbnail') continue;
    const position = audit.entityId ? input.fileIds.indexOf(audit.entityId) + 1 : 0;
    entries.push({
      id: audit.id,
      at: audit.createdAt.toISOString(),
      type,
      actorName: audit.actorName,
      ...(position > 0 ? { filePosition: position } : {}),
    });
  }

  return entries.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
