import { z } from 'zod';

/** Dados mínimos de exibição da loja na área pública (PRD §6.2). */
export interface PublicStoreView {
  storeNumber: string;
  storeName: string;
  acceptsSubmissions: boolean;
}

export interface PublicStoreSearchItem {
  id: string;
  storeNumber: string;
  storeName: string;
  neighborhood: string | null;
  city: string | null;
}

/** Contexto do link personalizado: apenas a loja. Nunca dados do paciente. */
export interface PublicPatientLinkContext {
  storeNumber: string;
  storeName: string;
}

export const publicStoreSearchQuerySchema = z.object({
  search: z.string().trim().min(2, 'Digite ao menos 2 caracteres.').max(60),
});
export type PublicStoreSearchQuery = z.infer<typeof publicStoreSearchQuerySchema>;

/** Resposta do envio: sem protocolo nem ID (RF-013). */
export interface SubmissionResponse {
  status: 'RECEIVED';
}
