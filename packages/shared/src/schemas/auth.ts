import { z } from 'zod';
import { PASSWORD_MAX_LENGTH } from '../password-policy.js';
import type { Role } from '../enums.js';
import { emailSchema } from './common.js';

export const loginSchema = z.object({
  email: emailSchema,
  // Sem regras de política no login: apenas limites para evitar abuso.
  password: z.string().min(1, 'Informe a senha.').max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Informe o código de 6 dígitos.');

export const recoveryCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^[A-Z2-9]{10}$/, 'Código de recuperação inválido.'));

export const totpConfirmSchema = z.object({ code: totpCodeSchema });
export type TotpConfirmInput = z.infer<typeof totpConfirmSchema>;

export const totpVerifySchema = z.union([
  z.object({ code: totpCodeSchema }).strict(),
  z.object({ recoveryCode: recoveryCodeSchema }).strict(),
]);
export type TotpVerifyInput = z.infer<typeof totpVerifySchema>;

export const totpDisableSchema = z.object({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  code: totpCodeSchema,
});
export type TotpDisableInput = z.infer<typeof totpDisableSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Link inválido ou expirado.'),
  // A política completa (comprimento mínimo configurável etc.) é aplicada no serviço.
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const LoginStatus = {
  AUTHENTICATED: 'AUTHENTICATED',
  MFA_REQUIRED: 'MFA_REQUIRED',
  MFA_ENROLLMENT_REQUIRED: 'MFA_ENROLLMENT_REQUIRED',
} as const;
export type LoginStatus = (typeof LoginStatus)[keyof typeof LoginStatus];

export interface LoginResponse {
  status: LoginStatus;
  csrfToken: string;
}

export interface StoreSummary {
  id: string;
  storeNumber: string;
  storeName: string;
  active: boolean;
}

export interface MeResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    totpEnabled: boolean;
    totpRequired: boolean;
  };
  sessionStatus: LoginStatus;
  /** Admin tem acesso global; os demais, apenas as lojas listadas. */
  storeScope: { global: true } | { global: false; stores: StoreSummary[] };
  csrfToken: string;
}

export interface TotpSetupResponse {
  otpauthUri: string;
  qrCodeDataUrl: string;
  /** Para digitação manual no app autenticador. Exibido apenas no setup. */
  secret: string;
}

export interface TotpConfirmResponse {
  recoveryCodes: string[];
  status: LoginStatus;
  csrfToken: string;
}

export interface TotpVerifyResponse {
  status: LoginStatus;
  csrfToken: string;
  /** Presente quando um código de recuperação foi usado. */
  remainingRecoveryCodes?: number;
}
