import type { ApiErrorBody, ApiErrorCode, ApiErrorIssue } from '@receita/shared';

/** Erro de API com código estável (mensagens já vêm genéricas do backend). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly issues: ApiErrorIssue[] = [],
    readonly requestId?: string,
  ) {
    super(message);
  }
}

let csrfToken = '';

/** O token CSRF vem do login, da verificação 2FA e de GET /auth/me (D-022). */
export function setCsrfToken(token: string | undefined): void {
  if (token) csrfToken = token;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  body?: unknown;
  formData?: FormData;
}

/**
 * Chamada à API pela mesma origem (`/api/*` → proxy do Next). Nunca registra
 * corpo de requisição/resposta (podem conter dados pessoais).
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body:
        options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar. Verifique sua conexão.');
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (data as Partial<ApiErrorBody> | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'Erro inesperado. Tente novamente.',
      error?.issues ?? [],
      error?.requestId,
    );
  }

  if (data && typeof data === 'object' && 'csrfToken' in data) {
    setCsrfToken((data as { csrfToken?: string }).csrfToken);
  }
  return data as T;
}

/** Mensagem de erro amigável para exibir em alertas. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'RATE_LIMITED')
      return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    return error.message;
  }
  return 'Erro inesperado. Tente novamente.';
}
