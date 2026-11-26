import { z } from 'zod';
import { selectionRefSchema } from './patients.js';
import {
  IdentificationStatus,
  type MalwareScanStatus,
  OperationalStatus,
  SourceChannel,
  StatusReason,
} from '../enums.js';
import { requiresReason, STATUS_REASON_NOTE_MAX } from '../status-matrix.js';
import { uuidSchema } from './common.js';
import { queryBoolean } from './pagination.js';

/** Lista separada por vírgula na query string (ex.: `?operationalStatus=RECEIVED,IN_REVIEW`). */
const csvEnum = <T extends Record<string, string>>(values: T) =>
  z
    .string()
    .max(200)
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1).max(10));

/** Filtros da fila (PRD §12.3). Nenhum filtro amplia o escopo do usuário. */
export const listPrescriptionsQuerySchema = z
  .object({
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{10,200}$/)
      .optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    sort: z.enum(['desc', 'asc']).default('desc'),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    storeId: uuidSchema.optional(),
    operationalStatus: csvEnum(OperationalStatus).optional(),
    identificationStatus: csvEnum(IdentificationStatus).optional(),
    sourceChannel: csvEnum(SourceChannel).optional(),
    hasCpf: queryBoolean.optional(),
    unviewed: queryBoolean.optional(),
    linked: queryBoolean.optional(),
  })
  .strict();
export type ListPrescriptionsQuery = z.infer<typeof listPrescriptionsQuerySchema>;

export const prescriptionCountersQuerySchema = listPrescriptionsQuerySchema.pick({
  from: true,
  to: true,
  storeId: true,
});
export type PrescriptionCountersQuery = z.infer<typeof prescriptionCountersQuerySchema>;

export interface PrescriptionStoreRef {
  id: string;
  storeNumber: string;
  storeName: string;
}

export interface PrescriptionListItem {
  id: string;
  receivedAt: string;
  store: PrescriptionStoreRef;
  operationalStatus: OperationalStatus;
  identificationStatus: IdentificationStatus;
  /** CPF mascarado (***.***.***-12) quando informado. */
  cpfMasked: string | null;
  /** Rótulo mínimo do paciente vinculado (nome abreviado), quando houver. */
  patientLabel: string | null;
  fileCount: number;
  isNew: boolean;
  sourceChannel: SourceChannel;
}

export interface PrescriptionListResponse {
  items: PrescriptionListItem[];
  nextCursor: string | null;
}

/** Chips da fila (DESIGN §13.5). */
export interface PrescriptionCounters {
  new: number;
  unidentified: number;
  inService: number;
  finished: number;
}

export interface PrescriptionFileView {
  id: string;
  /** Posição do anexo (1, 2, …) — o nome original não é exposto. */
  position: number;
  kind: 'image' | 'pdf';
  mimeType: string;
  sizeBytes: number;
  malwareScanStatus: MalwareScanStatus;
  /** Bloqueado quando INFECTED (D-057). */
  accessible: boolean;
  /** Derivado JPEG de visualização (HEIC/HEIF) e miniatura disponíveis. */
  previewAvailable: boolean;
  thumbnailAvailable: boolean;
}

export type TimelineEntryType =
  | 'received'
  | 'first_viewed'
  | 'file_viewed'
  | 'file_downloaded'
  | 'status_changed'
  | 'reopened'
  | 'patient_linked'
  | 'cpf_revealed';

export interface TimelineEntry {
  id: string;
  at: string;
  type: TimelineEntryType;
  /** Nome do usuário responsável (null para eventos do sistema/cliente). */
  actorName: string | null;
  fromStatus?: OperationalStatus | null;
  toStatus?: OperationalStatus;
  filePosition?: number;
  linkType?: string;
  /** Motivos de Reprovada / Reenvio solicitado (sem o texto livre). */
  reasons?: StatusReason[];
}

/** Motivos da decisão atual (Reprovada / Reenvio solicitado). */
export interface PrescriptionStatusDecision {
  reasons: StatusReason[];
  reasonNote: string | null;
  decidedAt: string;
  actorName: string | null;
}

export interface PrescriptionDetail {
  id: string;
  receivedAt: string;
  store: PrescriptionStoreRef;
  operationalStatus: OperationalStatus;
  identificationStatus: IdentificationStatus;
  sourceChannel: SourceChannel;
  cpfMasked: string | null;
  patientLabel: string | null;
  /** Versão para controle otimista em PATCH /status. */
  version: number;
  /** Transições permitidas ao usuário atual (matriz compartilhada). */
  allowedTransitions: OperationalStatus[];
  /** Presente quando o status atual exige motivos. */
  statusDecision: PrescriptionStatusDecision | null;
  files: PrescriptionFileView[];
  timeline: TimelineEntry[];
}

/** Sequência com cara de CPF (com ou sem pontuação): proibida no texto livre. */
const CPF_LIKE = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;

export const updatePrescriptionStatusSchema = z
  .object({
    toStatus: z.enum(OperationalStatus),
    version: z.number().int().min(0),
    /** Obrigatório (≥ 1) para Reprovada e Reenvio solicitado; proibido nos demais. */
    reasons: z.array(z.enum(StatusReason)).max(Object.keys(StatusReason).length).optional(),
    /** Detalhe de "Outros" (obrigatório quando OTHER é marcado). */
    reasonNote: z.string().trim().max(STATUS_REASON_NOTE_MAX).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const reasons = value.reasons ?? [];
    const note = value.reasonNote ?? '';
    if (!requiresReason(value.toStatus)) {
      if (reasons.length > 0 || note !== '') {
        ctx.addIssue({
          code: 'custom',
          path: ['reasons'],
          message: 'Motivos só se aplicam a Reprovada e Reenvio solicitado.',
        });
      }
      return;
    }
    if (reasons.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['reasons'], message: 'Selecione ao menos um motivo.' });
    }
    if (new Set(reasons).size !== reasons.length) {
      ctx.addIssue({ code: 'custom', path: ['reasons'], message: 'Motivo repetido.' });
    }
    const hasOther = reasons.includes(StatusReason.OTHER);
    if (hasOther && note === '') {
      ctx.addIssue({ code: 'custom', path: ['reasonNote'], message: 'Descreva o motivo.' });
    }
    if (!hasOther && note !== '') {
      ctx.addIssue({
        code: 'custom',
        path: ['reasonNote'],
        message: 'A descrição só se aplica ao motivo "Outros".',
      });
    }
    if (CPF_LIKE.test(note)) {
      ctx.addIssue({
        code: 'custom',
        path: ['reasonNote'],
        message: 'Não inclua CPF ou outros dados pessoais na descrição.',
      });
    }
  });
export type UpdatePrescriptionStatusInput = z.infer<typeof updatePrescriptionStatusSchema>;

export const fileUrlQuerySchema = z
  .object({ variant: z.enum(['original', 'preview', 'thumbnail']).default('original') })
  .strict();
export type FileUrlQuery = z.infer<typeof fileUrlQuerySchema>;

export interface SignedFileUrl {
  url: string;
  expiresAt: string;
}

export interface CpfRevealResponse {
  cpf: string;
}

export const userPreferencesSchema = z.object({ notificationSound: z.boolean() }).strict();
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

/** Eventos de tempo real (SSE): apenas IDs e campos não sensíveis. */
export type RealtimeEvent =
  | { type: 'prescription.created'; prescriptionId: string; storeId: string }
  | { type: 'prescription.viewed'; prescriptionId: string; storeId: string }
  | {
      type: 'prescription.status_changed';
      prescriptionId: string;
      storeId: string;
      operationalStatus: OperationalStatus;
      version: number;
    }
  | {
      type: 'prescription.patient_linked';
      prescriptionId: string;
      storeId: string;
      identificationStatus: IdentificationStatus;
    }
  | { type: 'counters.updated'; storeId: string };

/** Vínculo manual (PRD §8.6): apenas a referência opaca da busca (D-069). */
export const linkPatientSchema = z.object({ selectionRef: selectionRefSchema }).strict();
export type LinkPatientInput = z.infer<typeof linkPatientSchema>;

export interface LinkPatientResponse {
  identificationStatus: IdentificationStatus;
  /** Rótulo mascarado do paciente vinculado. */
  patientLabel: string;
}
