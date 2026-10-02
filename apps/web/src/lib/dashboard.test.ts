import { describe, expect, it } from 'vitest';
import {
  dashboardApiQuery,
  dashboardFiltersFromParams,
  dashboardFiltersToQuery,
  formatDay,
  formatDuration,
} from './dashboard';

describe('filtros do dashboard', () => {
  it('padrão de 7 dias e valores inválidos descartados', () => {
    expect(dashboardFiltersFromParams(new URLSearchParams())).toEqual({ period: '7d' });
    expect(dashboardFiltersFromParams(new URLSearchParams('period=ontem&from=x'))).toEqual({
      period: '7d',
    });
  });

  it('período personalizado exige as duas datas válidas', () => {
    const params = new URLSearchParams('period=custom&from=2026-09-01&to=2026-09-30&storeId=abc');
    const filters = dashboardFiltersFromParams(params);
    expect(filters).toEqual({
      period: 'custom',
      from: '2026-09-01',
      to: '2026-09-30',
      storeId: 'abc',
    });
    expect(dashboardFiltersToQuery(filters)).toBe(
      'period=custom&from=2026-09-01&to=2026-09-30&storeId=abc',
    );
    expect(dashboardApiQuery(filters)).toBe(
      'period=custom&from=2026-09-01&to=2026-09-30&storeIds=abc',
    );
  });

  it('personalizado incompleto consulta 7 dias até as datas serem preenchidas', () => {
    expect(dashboardApiQuery({ period: 'custom', from: '2026-09-01' })).toBe('period=7d');
    expect(dashboardFiltersToQuery({ period: '7d' })).toBe('');
  });
});

describe('formatação', () => {
  it('durações legíveis', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(720)).toBe('12 min');
    expect(formatDuration(3900)).toBe('1 h 05 min');
    expect(formatDuration(7200)).toBe('2 h');
    expect(formatDuration(183_600)).toBe('2 d 3 h');
  });

  it('dia local sem conversão de fuso', () => {
    expect(formatDay('2026-10-02')).toBe('02/10');
  });
});
