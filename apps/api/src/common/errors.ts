import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode, type ApiErrorIssue } from '@receita/shared';

const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_FAILED: 'Dados inválidos.',
  UNAUTHENTICATED: 'Sessão inválida ou expirada.',
  INVALID_CREDENTIALS: 'E-mail ou senha inválidos.',
  MFA_REQUIRED: 'Verificação em duas etapas necessária.',
  MFA_ENROLLMENT_REQUIRED: 'Configure a verificação em duas etapas para continuar.',
  INVALID_MFA_CODE: 'Código inválido.',
  FORBIDDEN: 'Você não tem permissão para esta ação.',
  CSRF_FAILED: 'Requisição não autorizada.',
  NOT_FOUND: 'Recurso não encontrado.',
  CONFLICT: 'Conflito com o estado atual do recurso.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde e tente novamente.',
  LINK_UNAVAILABLE:
    'Este link não está mais disponível. Solicite um novo link à Drogaria Venancio.',
  INVALID_OR_EXPIRED_TOKEN: 'Link inválido ou expirado.',
  PAYLOAD_TOO_LARGE: 'Requisição muito grande.',
  SERVICE_UNAVAILABLE: 'Serviço temporariamente indisponível.',
  INTERNAL_ERROR: 'Erro interno. Tente novamente.',
};

const STATUS: Record<ApiErrorCode, HttpStatus> = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  MFA_REQUIRED: HttpStatus.UNAUTHORIZED,
  MFA_ENROLLMENT_REQUIRED: HttpStatus.FORBIDDEN,
  INVALID_MFA_CODE: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  CSRF_FAILED: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  LINK_UNAVAILABLE: HttpStatus.NOT_FOUND,
  INVALID_OR_EXPIRED_TOKEN: HttpStatus.BAD_REQUEST,
  PAYLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** Erro de domínio com código estável e mensagem pública segura. */
export class AppError extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message?: string,
    readonly issues?: ApiErrorIssue[],
  ) {
    super(message ?? DEFAULT_MESSAGES[code], STATUS[code]);
  }
}

export function defaultMessage(code: ApiErrorCode): string {
  return DEFAULT_MESSAGES[code];
}
