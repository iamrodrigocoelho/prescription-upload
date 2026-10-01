import { z } from 'zod';
import { type Role, ROLES } from '../enums.js';
import { emailSchema, uuidSchema } from './common.js';
import { paginationSchema, queryBoolean } from './pagination.js';

const nameSchema = z.string().trim().min(2, 'Informe o nome.').max(200);
const storeIdsSchema = z
  .array(uuidSchema)
  .max(500)
  .transform((ids) => [...new Set(ids)]);
const roleSchema = z.enum(ROLES as [Role, ...Role[]]);

export const createUserSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    role: roleSchema,
    storeIds: storeIdsSchema.default([]),
    /** Padrão: obrigatório para ADMIN (D-009). */
    totpRequired: z.boolean().optional(),
  })
  .strict();
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: nameSchema,
    role: roleSchema,
    active: z.boolean(),
    totpRequired: z.boolean(),
    /** Obrigatório ao mudar para Colaborador/Gestor um usuário sem lojas. */
    storeIds: storeIdsSchema,
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nenhuma alteração informada.' });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const setUserStoresSchema = z.object({ storeIds: storeIdsSchema }).strict();
export type SetUserStoresInput = z.infer<typeof setUserStoresSchema>;

export const listUsersQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  active: queryBoolean.optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export interface UserStoreRef {
  id: string;
  storeNumber: string;
  storeName: string;
}

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  totpEnabled: boolean;
  totpRequired: boolean;
  /** Convite pendente: senha ainda não definida. */
  pendingInvite: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  stores: UserStoreRef[];
}
