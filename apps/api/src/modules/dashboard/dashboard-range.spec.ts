import { addDays, daysBetween, localDate, resolveRange } from './dashboard-range.js';

const TZ = 'America/Sao_Paulo';

describe('período do dashboard no fuso do sistema', () => {
  it('"hoje" usa o dia local, não o UTC', () => {
    // 01h30 UTC de 2 de outubro = 22h30 de 1º de outubro em São Paulo (UTC-3).
    const now = new Date('2026-10-02T01:30:00Z');
    expect(localDate(now, TZ)).toBe('2026-10-01');
    expect(resolveRange({ period: 'today' }, now, TZ, 90)).toEqual({
      from: '2026-10-01',
      to: '2026-10-01',
      timezone: TZ,
    });
  });

  it('últimos 7 e 30 dias incluem hoje', () => {
    const now = new Date('2026-10-02T15:00:00Z');
    expect(resolveRange({ period: '7d' }, now, TZ, 90)).toMatchObject({
      from: '2026-09-26',
      to: '2026-10-02',
    });
    expect(resolveRange({ period: '30d' }, now, TZ, 90)).toMatchObject({
      from: '2026-09-03',
      to: '2026-10-02',
    });
  });

  it('personalizado: aceita até o limite e rejeita acima ou datas inexistentes', () => {
    const now = new Date('2026-10-02T15:00:00Z');
    expect(
      resolveRange({ period: 'custom', from: '2026-07-05', to: '2026-10-02' }, now, TZ, 90),
    ).toMatchObject({ from: '2026-07-05', to: '2026-10-02' });
    expect(() =>
      resolveRange({ period: 'custom', from: '2026-07-04', to: '2026-10-02' }, now, TZ, 90),
    ).toThrow();
    expect(() =>
      resolveRange({ period: 'custom', from: '2026-02-30', to: '2026-03-02' }, now, TZ, 90),
    ).toThrow();
  });

  it('aritmética de datas atravessa meses e anos', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(1);
  });
});
