'use client';

import type {
  DashboardByStatus,
  DashboardByStore,
  DashboardPeriod,
  DashboardSummary,
  DashboardTimeseries,
} from '@receita/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface DashboardFilters {
  period: DashboardPeriod;
  from?: string;
  to?: string;
  /** Uma loja do escopo; ausente = todas as lojas do acesso (consolidado). */
  storeId?: string;
}

const PERIODS: readonly DashboardPeriod[] = ['today', '7d', '30d', 'custom'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Filtros a partir da URL; valores inválidos voltam ao padrão (7 dias). */
export function dashboardFiltersFromParams(params: URLSearchParams): DashboardFilters {
  const raw = params.get('period');
  const period = PERIODS.includes(raw as DashboardPeriod) ? (raw as DashboardPeriod) : '7d';
  const filters: DashboardFilters = { period };
  const from = params.get('from');
  const to = params.get('to');
  if (period === 'custom' && from && to && DAY.test(from) && DAY.test(to)) {
    filters.from = from;
    filters.to = to;
  }
  const storeId = params.get('storeId');
  if (storeId) filters.storeId = storeId;
  return filters;
}

/** Query string da página (estado compartilhável). */
export function dashboardFiltersToQuery(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.period !== '7d') params.set('period', filters.period);
  if (filters.period === 'custom' && filters.from && filters.to) {
    params.set('from', filters.from);
    params.set('to', filters.to);
  }
  if (filters.storeId) params.set('storeId', filters.storeId);
  return params.toString();
}

/** Query string da API (`storeIds`, período personalizado só com as duas datas). */
export function dashboardApiQuery(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  const custom = filters.period === 'custom' && filters.from && filters.to;
  params.set('period', filters.period === 'custom' && !custom ? '7d' : filters.period);
  if (custom) {
    params.set('from', filters.from!);
    params.set('to', filters.to!);
  }
  if (filters.storeId) params.set('storeIds', filters.storeId);
  return params.toString();
}

/** "45 s", "12 min", "1 h 05 min", "2 d 3 h" — tempo informativo (PRD §18.3). */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} d ${restHours} h` : `${days} d`;
}

/** "02/10" a partir de "2026-10-02" (sem conversão de fuso: o dia já é local). */
export function formatDay(day: string): string {
  const [, month, date] = day.split('-');
  return `${date}/${month}`;
}

export function useDashboard(filters: DashboardFilters) {
  const query = dashboardApiQuery(filters);
  const get =
    <T>(path: string) =>
    () =>
      api<T>(`/dashboard/${path}?${query}`);
  return {
    summary: useQuery({
      queryKey: ['dashboard', 'summary', query],
      queryFn: get<DashboardSummary>('summary'),
    }),
    timeseries: useQuery({
      queryKey: ['dashboard', 'timeseries', query],
      queryFn: get<DashboardTimeseries>('timeseries'),
    }),
    byStatus: useQuery({
      queryKey: ['dashboard', 'by-status', query],
      queryFn: get<DashboardByStatus>('by-status'),
    }),
    byStore: useQuery({
      queryKey: ['dashboard', 'by-store', query],
      queryFn: get<DashboardByStore>('by-store'),
    }),
  };
}
