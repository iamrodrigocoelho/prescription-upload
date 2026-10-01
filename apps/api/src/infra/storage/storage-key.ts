import { randomUUID } from 'node:crypto';

/**
 * Chave interna gerada pelo sistema (PRD §9.4): não deriva do nome original do
 * arquivo nem contém dados pessoais. Formato: `<prefixo>/<aaaa>/<mm>/<uuid>`.
 */
export function generateStorageKey(prefix = 'prescriptions', now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${prefix}/${year}/${month}/${randomUUID()}`;
}

// eslint-disable-next-line no-control-regex -- remover caracteres de controle é o objetivo
const UNSAFE_FILENAME_CHARS = /[\u0000-\u001f\u007f"\\/]/g;

/**
 * Valor seguro para Content-Disposition: nome ASCII de fallback (sem aspas, barras
 * ou caracteres de controle) + `filename*` UTF-8 (RFC 6266/5987).
 */
export function contentDisposition(disposition: 'inline' | 'attachment', filename: string): string {
  const cleaned = filename.replace(UNSAFE_FILENAME_CHARS, '_').trim().slice(0, 150) || 'arquivo';
  const ascii = cleaned.normalize('NFKD').replace(/[^\x20-\x7e]/g, '_');
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`;
}
