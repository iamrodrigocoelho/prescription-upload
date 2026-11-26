import { type OperationalStatus, Role, type StatusReason } from './enums.js';

/**
 * Matriz de transições do status operacional (PRD §11; D-055, revista em D-087).
 * Fonte única para backend e frontend. A análise termina em uma decisão:
 * Aprovada segue para atendimento; Reprovada e Reenvio solicitado encerram.
 */
const FORWARD: Readonly<Record<OperationalStatus, readonly OperationalStatus[]>> = {
  RECEIVED: ['IN_REVIEW', 'CANCELLED', 'NOT_SERVED'],
  IN_REVIEW: ['APPROVED', 'REJECTED', 'RESUBMISSION_REQUESTED', 'CANCELLED', 'NOT_SERVED'],
  APPROVED: ['IN_SERVICE', 'IN_REVIEW', 'CANCELLED', 'NOT_SERVED'],
  IN_SERVICE: ['IN_REVIEW', 'FINISHED', 'CANCELLED', 'NOT_SERVED'],
  REJECTED: [],
  RESUBMISSION_REQUESTED: [],
  FINISHED: [],
  CANCELLED: [],
  NOT_SERVED: [],
};

export const FINAL_STATUSES: readonly OperationalStatus[] = [
  'REJECTED',
  'RESUBMISSION_REQUESTED',
  'FINISHED',
  'CANCELLED',
  'NOT_SERVED',
];

/** Decisões que exigem ao menos um motivo (D-087). */
export const STATUSES_REQUIRING_REASON: readonly OperationalStatus[] = [
  'REJECTED',
  'RESUBMISSION_REQUESTED',
];

export function requiresReason(status: OperationalStatus): boolean {
  return STATUSES_REQUIRING_REASON.includes(status);
}

/** Limite do texto de "Outros" (sem dados pessoais — validado no schema). */
export const STATUS_REASON_NOTE_MAX = 200;

/** Ordem de exibição dos motivos. */
export const STATUS_REASON_LABELS: Readonly<Record<StatusReason, string>> = {
  ISSUE_DATE_EXPIRED: 'Data de emissão da receita expirada',
  CRM_ILLEGIBLE: 'CRM ilegível',
  MEDICATION_NOT_LISTED: 'Medicamento não consta na receita',
  CONTENT_ILLEGIBLE: 'Conteúdo ilegível',
  MISSING_SIGNATURE_STAMP: 'Falta assinatura ou carimbo do prescritor',
  INCOMPLETE_FILE: 'Arquivo incompleto ou cortado',
  DIFFERENT_PATIENT: 'Receita de outro paciente',
  OTHER: 'Outros',
};

/** Reabertura de estado final (→ Em análise): somente Gestor e Admin. */
export const REOPEN_TARGET: OperationalStatus = 'IN_REVIEW';
const CAN_REOPEN: readonly Role[] = [Role.MANAGER, Role.ADMIN];

export function isFinalStatus(status: OperationalStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

export function allowedTransitions(from: OperationalStatus, role: Role): OperationalStatus[] {
  if (isFinalStatus(from)) return CAN_REOPEN.includes(role) ? [REOPEN_TARGET] : [];
  return [...FORWARD[from]];
}

export function canTransition(from: OperationalStatus, to: OperationalStatus, role: Role): boolean {
  return allowedTransitions(from, role).includes(to);
}

export function isReopen(from: OperationalStatus, to: OperationalStatus): boolean {
  return isFinalStatus(from) && to === REOPEN_TARGET;
}

export const OPERATIONAL_STATUS_LABELS: Readonly<Record<OperationalStatus, string>> = {
  RECEIVED: 'Recebida',
  IN_REVIEW: 'Em análise',
  APPROVED: 'Aprovada',
  REJECTED: 'Reprovada',
  RESUBMISSION_REQUESTED: 'Reenvio solicitado',
  IN_SERVICE: 'Em atendimento',
  FINISHED: 'Finalizada',
  CANCELLED: 'Cancelada',
  NOT_SERVED: 'Não atendida',
};

export const IDENTIFICATION_STATUS_LABELS = {
  NOT_IDENTIFIED: 'Não identificado',
  IDENTIFIED_AUTO_CPF: 'Identificado automaticamente por CPF',
  IDENTIFIED_MANUAL: 'Identificado manualmente',
  IDENTIFIED_PERSONALIZED_LINK: 'Identificado por link personalizado',
} as const;

export const SOURCE_CHANNEL_LABELS = {
  GENERIC: 'Entrada genérica',
  STORE_LINK: 'Link da loja',
  PERSONALIZED_LINK: 'Link personalizado',
} as const;
