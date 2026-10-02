import { type OperationalStatus, Role } from './enums.js';

/**
 * Matriz de transições do status operacional (PRD §11; aprovada na Fase 3 — D-055).
 * Fonte única para backend e frontend.
 */
const FORWARD: Readonly<Record<OperationalStatus, readonly OperationalStatus[]>> = {
  RECEIVED: ['IN_REVIEW', 'IN_SERVICE', 'CANCELLED', 'NOT_SERVED'],
  IN_REVIEW: ['IN_SERVICE', 'CANCELLED', 'NOT_SERVED'],
  IN_SERVICE: ['IN_REVIEW', 'FINISHED', 'CANCELLED', 'NOT_SERVED'],
  FINISHED: [],
  CANCELLED: [],
  NOT_SERVED: [],
};

export const FINAL_STATUSES: readonly OperationalStatus[] = ['FINISHED', 'CANCELLED', 'NOT_SERVED'];

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
