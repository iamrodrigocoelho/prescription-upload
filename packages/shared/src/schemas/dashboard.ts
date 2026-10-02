import { z } from 'zod';
import { type OperationalStatus } from '../enums.js';
import { uuidSchema } from './common.js';

export const DashboardPeriod = {
  TODAY: 'today',
  LAST_7: '7d',
  LAST_30: '30d',
  CUSTOM: 'custom',
} as const;
export type DashboardPeriod = (typeof DashboardPeriod)[keyof typeof DashboardPeriod];

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD).');

/**
 * Filtros do dashboard (PRD §18.4). Datas são dias no fuso do sistema (APP_TIMEZONE).
 * O limite máximo do intervalo customizado é validado no backend (env). O filtro de
 * lojas nunca amplia o escopo do usuário.
 */
export const dashboardQuerySchema = z
  .object({
    period: z.enum(DashboardPeriod).default('7d'),
    from: localDate.optional(),
    to: localDate.optional(),
    storeIds: z
      .string()
      .max(8_000)
      .transform((value) => value.split(',').filter(Boolean))
      .pipe(z.array(uuidSchema).min(1).max(200))
      .optional(),
  })
  .strict()
  .superRefine((query, ctx) => {
    if (query.period !== 'custom') {
      if (query.from || query.to) {
        ctx.addIssue({
          code: 'custom',
          path: ['from'],
          message: 'Use datas apenas no período personalizado.',
        });
      }
      return;
    }
    if (!query.from || !query.to) {
      ctx.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'Informe a data inicial e a final.',
      });
    } else if (query.from > query.to) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'A data final deve ser igual ou posterior à inicial.',
      });
    }
  });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export interface DashboardRange {
  /** Primeiro e último dia (inclusive), no fuso do sistema. */
  from: string;
  to: string;
  timezone: string;
}

/** Tempo informativo (PRD §18.3, sem SLA): mediana, p90 e amostra. */
export interface DurationStat {
  medianSeconds: number | null;
  p90Seconds: number | null;
  count: number;
}

export interface DashboardSummary {
  range: DashboardRange;
  receivedToday: number;
  receivedInPeriod: number;
  unviewed: number;
  unidentified: number;
  identifiedAuto: number;
  identifiedManual: number;
  identifiedPersonalizedLink: number;
  personalizedLinkSubmissions: number;
  finished: number;
  cancelled: number;
  notServed: number;
  /** Apenas para quem pode ver links personalizados; `null` caso contrário. */
  links: { active: number; used: number; expired: number } | null;
  timings: {
    toFirstView: DurationStat;
    toIdentification: DurationStat;
    toFinalization: DurationStat;
  };
}

export interface DashboardTimeseries {
  range: DashboardRange;
  days: { date: string; received: number; finished: number }[];
}

export interface DashboardByStatus {
  range: DashboardRange;
  items: { status: OperationalStatus; count: number }[];
}

export interface DashboardStoreRow {
  store: { id: string; storeNumber: string; storeName: string };
  received: number;
  unviewed: number;
  unidentified: number;
  /** Ainda não finalizadas, canceladas ou não atendidas. */
  open: number;
}

export interface DashboardByStore {
  range: DashboardRange;
  items: DashboardStoreRow[];
}
