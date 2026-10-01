/**
 * Códigos de erro da API. Mensagens públicas são genéricas e nunca revelam a
 * existência de usuários, pacientes ou links.
 */
export const ApiErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  MFA_REQUIRED: 'MFA_REQUIRED',
  MFA_ENROLLMENT_REQUIRED: 'MFA_ENROLLMENT_REQUIRED',
  INVALID_MFA_CODE: 'INVALID_MFA_CODE',
  FORBIDDEN: 'FORBIDDEN',
  CSRF_FAILED: 'CSRF_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  LINK_UNAVAILABLE: 'LINK_UNAVAILABLE',
  INVALID_OR_EXPIRED_TOKEN: 'INVALID_OR_EXPIRED_TOKEN',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export interface ApiErrorIssue {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId?: string;
    issues?: ApiErrorIssue[];
  };
}
