/**
 * Mascaramento de dados pessoais para desambiguação mínima (PRD §17.3).
 */

/** "João da Silva" → "João S." */
export function maskName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '—';
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

/** "(21) 98765-4321" → "*****-4321" */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) return '*****-****';
  return `*****-${digits.slice(-4)}`;
}

/** "joao.silva@example.com" → "j***@e***.com" */
export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? '').trim();
  const at = value.lastIndexOf('@');
  if (at < 1) return '***';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  if (dot < 1) return `${local.charAt(0)}***@***`;
  return `${local.charAt(0)}***@${domain.charAt(0)}***${domain.slice(dot)}`;
}
