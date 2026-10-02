import { z } from 'zod';
import { PatientUploadLinkStatus } from '../enums.js';
import { uuidSchema } from './common.js';
import { paginationSchema } from './pagination.js';
import { selectionRefSchema } from './patients.js';

/** Opções de validade oferecidas na geração (D-013), limitadas pelo máximo configurado. */
export const PATIENT_LINK_EXPIRY_OPTIONS = [1, 3, 7, 15, 30] as const;

export const createPatientLinkSchema = z
  .object({
    storeId: uuidSchema,
    /** Referência opaca devolvida pela busca no contexto desta loja (D-069). */
    selectionRef: selectionRefSchema,
    /** Ausente: usa o padrão configurado (SystemSetting). */
    expiresInDays: z.number().int().min(1).max(90).optional(),
  })
  .strict();
export type CreatePatientLinkInput = z.infer<typeof createPatientLinkSchema>;

export const listPatientLinksQuerySchema = paginationSchema.extend({
  storeId: uuidSchema.optional(),
  status: z.enum(PatientUploadLinkStatus).optional(),
});
export type ListPatientLinksQuery = z.infer<typeof listPatientLinksQuerySchema>;

export interface PatientLinkView {
  id: string;
  store: { id: string; storeNumber: string; storeName: string };
  /** Rótulo já mascarado (ex.: "João S. · CPF ***.***.***-12"). */
  patientLabel: string;
  createdBy: { id: string; name: string };
  createdAt: string;
  expiresAt: string;
  status: PatientUploadLinkStatus;
  usedAt: string | null;
  revokedAt: string | null;
}

export interface CreatePatientLinkResponse {
  link: PatientLinkView;
  /**
   * URL com o token em texto puro. Retornada uma única vez, nesta resposta; não é
   * persistida nem recuperável depois (PRD §17.4).
   */
  url: string;
}

export interface PatientLinkOptions {
  defaultExpiryDays: number;
  maxExpiryDays: number;
  expiryOptions: number[];
}
