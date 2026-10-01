import { z } from 'zod';
import { paginationSchema, queryBoolean } from './pagination.js';

export const BRAZIL_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

/** Bloqueia valores que planilhas interpretariam como fórmula (CSV injection). */
const FORMULA_PREFIX = /^[=+@\t\r]/;
const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => !FORMULA_PREFIX.test(value),
      'Valor não permitido (inicia com caractere de fórmula).',
    );

export const storeNumberSchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z-]{1,20}$/, 'Número da loja inválido (até 20 letras, números ou hífen).');

const optionalText = (max: number) =>
  safeText(max)
    .optional()
    .transform((value) => (value ? value : null));

export const stateSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(BRAZIL_STATES, 'UF inválida.'));

export const storeFieldsSchema = z.object({
  storeName: safeText(200).pipe(z.string().min(2, 'Informe o nome da loja.')),
  active: z.boolean(),
  address: optionalText(300),
  neighborhood: optionalText(120),
  city: optionalText(120),
  state: z
    .union([stateSchema, z.literal('').transform(() => null), z.null()])
    .optional()
    .transform((value) => value ?? null),
});

export const createStoreSchema = storeFieldsSchema
  .extend({ storeNumber: storeNumberSchema })
  .strict();
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const updateStoreSchema = storeFieldsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nenhuma alteração informada.' });
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

export const listStoresQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  active: queryBoolean.optional(),
});
export type ListStoresQuery = z.infer<typeof listStoresQuerySchema>;

export interface StoreView {
  id: string;
  storeNumber: string;
  storeName: string;
  active: boolean;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  /** URL pública da loja (/l/{slug}) para cópia. */
  publicUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreImportRowError {
  /** Linha do arquivo (1 = cabeçalho). */
  line: number;
  field?: string;
  message: string;
}

export interface StoreImportReport {
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: StoreImportRowError[];
}
