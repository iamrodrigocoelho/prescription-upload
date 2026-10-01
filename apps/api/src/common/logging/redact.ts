/**
 * Proteções contra vazamento de dados sensíveis em logs (PRD §22, §34, §35).
 * Regra: logs nunca contêm CPF integral, tokens, senhas, segredos TOTP ou conteúdo de receita.
 */

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY =
  /^(.*password.*|.*token.*|.*secret.*|.*cpf.*|totp.*|otp|code|recoverycodes?|authorization|cookie|set-cookie)$/i;

// CPF com ou sem máscara, isolado por fronteiras não numéricas.
const CPF_PATTERN = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g;

const MAX_DEPTH = 8;

export function scrubString(value: string): string {
  return value.replace(CPF_PATTERN, '***.***.***-**');
}

/** Remove recursivamente chaves sensíveis e padrões de CPF em strings. */
export function scrubSensitive(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[Truncated]';
  if (value instanceof Error) {
    return { type: value.name, message: scrubString(value.message), stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((item) => scrubSensitive(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrubSensitive(item, depth + 1);
  }
  return output;
}

/**
 * Rotas cujo último segmento é uma credencial (links personalizados, tokens de reset).
 * O segmento é substituído antes de qualquer log.
 */
const TOKEN_PATH_PATTERNS: RegExp[] = [/^(\/p\/)[^/?#]+/, /^(\/public\/patient-links\/)[^/?#]+/];

/** Remove query string (pode conter PII) e tokens em segmentos de path. */
export function sanitizeUrl(url: string | undefined): string {
  if (!url) return '';
  const [path = ''] = url.split('?');
  let sanitized = path;
  for (const pattern of TOKEN_PATH_PATTERNS) {
    sanitized = sanitized.replace(pattern, `$1${REDACTED}`);
  }
  return scrubString(sanitized);
}
