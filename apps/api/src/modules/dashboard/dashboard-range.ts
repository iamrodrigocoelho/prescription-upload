import { ApiErrorCode, type DashboardQuery, type DashboardRange } from '@receita/shared';
import { AppError } from '../../common/errors.js';

/** Dia corrente (AAAA-MM-DD) no fuso informado. */
export function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Soma dias a uma data de calendário (sem fuso: aritmética pura de datas). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isRealDate(day: string): boolean {
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

/** Quantidade de dias de um intervalo inclusivo. */
export function daysBetween(from: string, to: string): number {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  );
}

/**
 * Converte o filtro de período em dias de calendário no fuso do sistema (D-077):
 * "hoje", últimos 7 ou 30 dias (incluindo hoje) ou intervalo personalizado limitado.
 */
export function resolveRange(
  query: Pick<DashboardQuery, 'period' | 'from' | 'to'>,
  now: Date,
  timezone: string,
  maxDays: number,
): DashboardRange {
  const today = localDate(now, timezone);
  switch (query.period) {
    case 'today':
      return { from: today, to: today, timezone };
    case '7d':
      return { from: addDays(today, -6), to: today, timezone };
    case '30d':
      return { from: addDays(today, -29), to: today, timezone };
    default: {
      const from = query.from ?? '';
      const to = query.to ?? '';
      if (!isRealDate(from) || !isRealDate(to) || from > to) {
        throw new AppError(ApiErrorCode.VALIDATION_FAILED, undefined, [
          { path: 'from', message: 'Período inválido.' },
        ]);
      }
      if (daysBetween(from, to) > maxDays) {
        throw new AppError(ApiErrorCode.VALIDATION_FAILED, undefined, [
          { path: 'to', message: `O período pode ter no máximo ${maxDays} dias.` },
        ]);
      }
      return { from, to, timezone };
    }
  }
}
