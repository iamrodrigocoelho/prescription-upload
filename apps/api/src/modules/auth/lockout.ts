/**
 * Bloqueio progressivo por conta (PRD §15.2): ao atingir `threshold` falhas
 * consecutivas, bloqueia `base` segundos, dobrando a cada nova falha até `max`.
 */
export function lockoutSeconds(
  failedCount: number,
  threshold: number,
  baseSeconds: number,
  maxSeconds: number,
): number {
  if (failedCount < threshold) return 0;
  const exponent = Math.min(failedCount - threshold, 30);
  return Math.min(baseSeconds * 2 ** exponent, maxSeconds);
}
