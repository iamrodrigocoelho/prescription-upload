import { Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditResult,
  type DashboardByStatus,
  type DashboardByStore,
  type DashboardQuery,
  type DashboardRange,
  type DashboardSummary,
  type DashboardTimeseries,
  type DurationStat,
  hasPermission,
  isStoreInScope,
  OperationalStatus,
  Permission,
} from '@receita/shared';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StoreScopeService } from '../auth/store-scope.service.js';
import { localDate, resolveRange } from './dashboard-range.js';

interface Window {
  range: DashboardRange;
  /** Lojas efetivas (escopo ∩ filtro); `null` = global (Admin sem filtro). */
  storeIds: string[] | null;
  start: Prisma.Sql;
  end: Prisma.Sql;
}

type PercentileRow = { p: number[] | null; n: number };

function stat(row: PercentileRow | undefined): DurationStat {
  const [median, p90] = row?.p ?? [];
  return {
    medianSeconds: median === undefined || median === null ? null : Math.round(median),
    p90Seconds: p90 === undefined || p90 === null ? null : Math.round(p90),
    count: row?.n ?? 0,
  };
}

/**
 * Dashboard operacional e gerencial (PRD §18, §26.8; D-077). Toda consulta aplica o
 * escopo do usuário no SQL; o filtro de lojas só reduz o conjunto. Dias e "hoje"
 * no fuso do sistema (APP_TIMEZONE). Métricas por coorte: receitas recebidas no
 * período.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: StoreScopeService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async summary(auth: AuthContext, query: DashboardQuery): Promise<DashboardSummary> {
    const w = await this.window(auth, query);
    const tz = this.env.APP_TIMEZONE;
    const today = localDate(new Date(), tz);
    const todayStart = Prisma.sql`(${today}::date)::timestamp AT TIME ZONE ${tz}`;
    const scope = this.scopeSql(w, Prisma.sql`s.store_id`);
    const cohort = Prisma.sql`
      SELECT s.id, s.created_at, s.first_viewed_at, s.identification_status,
             s.operational_status, s.source_channel
        FROM prescription_submissions s
       WHERE ${scope} AND s.created_at >= ${w.start} AND s.created_at < ${w.end}`;

    const [[counts], [today_], [firstView], [identification], [finalization], links] =
      await Promise.all([
        this.prisma.$queryRaw<Record<string, number>[]>`
          WITH cohort AS (${cohort})
          SELECT count(*)::int AS received,
                 count(*) FILTER (WHERE first_viewed_at IS NULL)::int AS unviewed,
                 count(*) FILTER (WHERE identification_status = 'NOT_IDENTIFIED')::int AS unidentified,
                 count(*) FILTER (WHERE identification_status = 'IDENTIFIED_AUTO_CPF')::int AS auto,
                 count(*) FILTER (WHERE identification_status = 'IDENTIFIED_MANUAL')::int AS manual,
                 count(*) FILTER (WHERE identification_status = 'IDENTIFIED_PERSONALIZED_LINK')::int AS link,
                 count(*) FILTER (WHERE source_channel = 'PERSONALIZED_LINK')::int AS personalized,
                 count(*) FILTER (WHERE operational_status = 'FINISHED')::int AS finished,
                 count(*) FILTER (WHERE operational_status = 'CANCELLED')::int AS cancelled,
                 count(*) FILTER (WHERE operational_status = 'NOT_SERVED')::int AS not_served
            FROM cohort`,
        this.prisma.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM prescription_submissions s
           WHERE ${scope} AND s.created_at >= ${todayStart}`,
        this.prisma.$queryRaw<PercentileRow[]>`
          WITH cohort AS (${cohort})
          SELECT percentile_cont(ARRAY[0.5, 0.9]) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM first_viewed_at - created_at)) AS p,
                 count(*)::int AS n
            FROM cohort WHERE first_viewed_at IS NOT NULL`,
        // Só vínculos automático e manual: o link personalizado já nasce identificado.
        this.prisma.$queryRaw<PercentileRow[]>`
          WITH cohort AS (${cohort}),
          firsts AS (
            SELECT EXTRACT(EPOCH FROM min(h.created_at) - c.created_at) AS secs
              FROM cohort c
              JOIN patient_link_history h ON h.submission_id = c.id
             WHERE h.link_type IN ('AUTOMATIC_CPF', 'MANUAL')
             GROUP BY c.id, c.created_at)
          SELECT percentile_cont(ARRAY[0.5, 0.9]) WITHIN GROUP (ORDER BY secs) AS p,
                 count(*)::int AS n FROM firsts`,
        // Primeira finalização (mesmo que a receita tenha sido reaberta depois).
        this.prisma.$queryRaw<PercentileRow[]>`
          WITH cohort AS (${cohort}),
          firsts AS (
            SELECT EXTRACT(EPOCH FROM min(h.created_at) - c.created_at) AS secs
              FROM cohort c
              JOIN status_history h ON h.submission_id = c.id
             WHERE h.to_status = 'FINISHED'
             GROUP BY c.id, c.created_at)
          SELECT percentile_cont(ARRAY[0.5, 0.9]) WITHIN GROUP (ORDER BY secs) AS p,
                 count(*)::int AS n FROM firsts`,
        hasPermission(auth.user.role, Permission.PATIENT_LINKS_READ)
          ? this.links(w)
          : Promise.resolve(null),
      ]);

    return {
      range: w.range,
      receivedToday: today_?.n ?? 0,
      receivedInPeriod: counts?.received ?? 0,
      unviewed: counts?.unviewed ?? 0,
      unidentified: counts?.unidentified ?? 0,
      identifiedAuto: counts?.auto ?? 0,
      identifiedManual: counts?.manual ?? 0,
      identifiedPersonalizedLink: counts?.link ?? 0,
      personalizedLinkSubmissions: counts?.personalized ?? 0,
      finished: counts?.finished ?? 0,
      cancelled: counts?.cancelled ?? 0,
      notServed: counts?.not_served ?? 0,
      links,
      timings: {
        toFirstView: stat(firstView),
        toIdentification: stat(identification),
        toFinalization: stat(finalization),
      },
    };
  }

  /** Volume por dia (recebidas e finalizações), com dias sem movimento zerados. */
  async timeseries(auth: AuthContext, query: DashboardQuery): Promise<DashboardTimeseries> {
    const w = await this.window(auth, query);
    const tz = this.env.APP_TIMEZONE;
    const scope = this.scopeSql(w, Prisma.sql`s.store_id`);
    const days = await this.prisma.$queryRaw<
      { date: string; received: number; finished: number }[]
    >`
      WITH days AS (
        SELECT generate_series(${w.range.from}::date, ${w.range.to}::date, interval '1 day')::date AS day),
      rec AS (
        SELECT (s.created_at AT TIME ZONE ${tz})::date AS day, count(*)::int AS n
          FROM prescription_submissions s
         WHERE ${scope} AND s.created_at >= ${w.start} AND s.created_at < ${w.end}
         GROUP BY 1),
      fin AS (
        SELECT (h.created_at AT TIME ZONE ${tz})::date AS day, count(DISTINCT h.submission_id)::int AS n
          FROM status_history h
          JOIN prescription_submissions s ON s.id = h.submission_id
         WHERE ${scope} AND h.to_status = 'FINISHED'
           AND h.created_at >= ${w.start} AND h.created_at < ${w.end}
         GROUP BY 1)
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
             coalesce(rec.n, 0)::int AS received,
             coalesce(fin.n, 0)::int AS finished
        FROM days d
        LEFT JOIN rec ON rec.day = d.day
        LEFT JOIN fin ON fin.day = d.day
       ORDER BY d.day`;
    return { range: w.range, days };
  }

  async byStatus(auth: AuthContext, query: DashboardQuery): Promise<DashboardByStatus> {
    const w = await this.window(auth, query);
    const scope = this.scopeSql(w, Prisma.sql`s.store_id`);
    const rows = await this.prisma.$queryRaw<{ status: OperationalStatus; count: number }[]>`
      SELECT s.operational_status::text AS status, count(*)::int AS count
        FROM prescription_submissions s
       WHERE ${scope} AND s.created_at >= ${w.start} AND s.created_at < ${w.end}
       GROUP BY 1`;
    const counts = new Map(rows.map((row) => [row.status, row.count]));
    return {
      range: w.range,
      items: Object.values(OperationalStatus).map((status) => ({
        status,
        count: counts.get(status) ?? 0,
      })),
    };
  }

  /** Ranking por volume e pendências por loja (até 100 lojas). */
  async byStore(auth: AuthContext, query: DashboardQuery): Promise<DashboardByStore> {
    const w = await this.window(auth, query);
    const scope = this.scopeSql(w, Prisma.sql`s.store_id`);
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        store_number: string;
        store_name: string;
        received: number;
        unviewed: number;
        unidentified: number;
        open: number;
      }[]
    >`
      SELECT st.id, st.store_number, st.store_name,
             count(*)::int AS received,
             count(*) FILTER (WHERE s.first_viewed_at IS NULL)::int AS unviewed,
             count(*) FILTER (WHERE s.identification_status = 'NOT_IDENTIFIED')::int AS unidentified,
             count(*) FILTER (
               WHERE s.operational_status NOT IN ('FINISHED', 'CANCELLED', 'NOT_SERVED'))::int AS open
        FROM prescription_submissions s
        JOIN stores st ON st.id = s.store_id
       WHERE ${scope} AND s.created_at >= ${w.start} AND s.created_at < ${w.end}
       GROUP BY st.id, st.store_number, st.store_name
       ORDER BY received DESC, st.store_number
       LIMIT 100`;
    return {
      range: w.range,
      items: rows.map((row) => ({
        store: { id: row.id, storeNumber: row.store_number, storeName: row.store_name },
        received: row.received,
        unviewed: row.unviewed,
        unidentified: row.unidentified,
        open: row.open,
      })),
    };
  }

  /**
   * Links: ativos agora; utilizados e expirados dentro do período (não por coorte
   * de criação — um link de 7 dias atravessa períodos).
   */
  private async links(w: Window): Promise<DashboardSummary['links']> {
    const scope = this.scopeSql(w, Prisma.sql`l.store_id`);
    const [row] = await this.prisma.$queryRaw<{ active: number; used: number; expired: number }[]>`
      SELECT count(*) FILTER (WHERE l.status = 'ACTIVE' AND l.expires_at > now())::int AS active,
             count(*) FILTER (
               WHERE l.status = 'USED' AND l.used_at >= ${w.start} AND l.used_at < ${w.end})::int AS used,
             count(*) FILTER (
               WHERE l.status = 'ACTIVE' AND l.expires_at <= now()
                 AND l.expires_at >= ${w.start} AND l.expires_at < ${w.end})::int AS expired
        FROM patient_upload_links l
       WHERE ${scope}`;
    return { active: row?.active ?? 0, used: row?.used ?? 0, expired: row?.expired ?? 0 };
  }

  /** Período + lojas efetivas. Loja fora do escopo no filtro → 403 auditado. */
  private async window(auth: AuthContext, query: DashboardQuery): Promise<Window> {
    const range = resolveRange(
      query,
      new Date(),
      this.env.APP_TIMEZONE,
      this.env.DASHBOARD_MAX_RANGE_DAYS,
    );
    const scope = await this.scope.scopeFor(auth);
    let storeIds: string[] | null = scope.all ? null : [...scope.storeIds];
    if (query.storeIds) {
      const outside = query.storeIds.filter((id) => !isStoreInScope(scope, id));
      if (outside.length > 0) {
        await this.audit.recordSafely({
          action: AuditAction.AUTHZ_DENIED,
          entityType: 'Store',
          entityId: outside[0] ?? null,
          result: AuditResult.DENIED,
          metadata: { reason: 'store_out_of_scope', source: 'dashboard' },
        });
        throw new AppError(ApiErrorCode.FORBIDDEN);
      }
      storeIds = [...new Set(query.storeIds)];
    }
    const tz = this.env.APP_TIMEZONE;
    return {
      range,
      storeIds,
      start: Prisma.sql`(${range.from}::date)::timestamp AT TIME ZONE ${tz}`,
      end: Prisma.sql`((${range.to}::date + 1)::timestamp) AT TIME ZONE ${tz}`,
    };
  }

  private scopeSql(w: Window, column: Prisma.Sql): Prisma.Sql {
    return w.storeIds === null
      ? Prisma.sql`TRUE`
      : Prisma.sql`${column} = ANY(${w.storeIds}::uuid[])`;
  }
}
