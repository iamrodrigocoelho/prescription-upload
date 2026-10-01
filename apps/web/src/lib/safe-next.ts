/**
 * Valida o destino pós-login (`?next=`) contra open redirect: apenas caminhos
 * internos da área administrativa.
 */
export function safeNextPath(value: string | null | undefined, fallback = '/admin'): string {
  if (!value) return fallback;
  if (!value.startsWith('/admin')) return fallback;
  if (value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value))
    return fallback;
  try {
    const url = new URL(value, 'http://interno.invalid');
    if (url.origin !== 'http://interno.invalid') return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
