'use client';

import type {
  PrescriptionCounters,
  PrescriptionDetail,
  PrescriptionListResponse,
} from '@receita/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from './api';

export const QUEUE_FILTER_KEYS = [
  'storeId',
  'from',
  'to',
  'operationalStatus',
  'identificationStatus',
  'sourceChannel',
  'hasCpf',
  'unviewed',
  'linked',
  'sort',
] as const;
export type QueueFilters = Partial<Record<(typeof QUEUE_FILTER_KEYS)[number], string>>;

/** Filtros a partir da URL (estado compartilhável/recarregável). */
export function filtersFromParams(params: URLSearchParams): QueueFilters {
  const filters: QueueFilters = {};
  for (const key of QUEUE_FILTER_KEYS) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  return filters;
}

export function filtersToQuery(filters: QueueFilters): string {
  const params = new URLSearchParams();
  for (const key of QUEUE_FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function useQueue(filters: QueueFilters) {
  const query = filtersToQuery(filters);
  return useInfiniteQuery({
    queryKey: ['prescriptions', 'queue', query],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<PrescriptionListResponse>(
        `/prescriptions?${query}${query ? '&' : ''}limit=25${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useCounters(filters: QueueFilters) {
  const query = filtersToQuery({ storeId: filters.storeId, from: filters.from, to: filters.to });
  return useQuery({
    queryKey: ['prescriptions', 'counters', query],
    queryFn: () => api<PrescriptionCounters>(`/prescriptions/counters${query ? `?${query}` : ''}`),
  });
}

/** Contador global de não visualizadas (badge da navegação). */
export function useUnviewedBadge(enabled: boolean) {
  return useQuery({
    queryKey: ['prescriptions', 'counters', 'badge'],
    queryFn: () => api<PrescriptionCounters>('/prescriptions/counters'),
    enabled,
    select: (counters) => counters.new,
  });
}

export function usePrescription(id: string) {
  return useQuery({
    queryKey: ['prescriptions', 'detail', id],
    queryFn: () => api<PrescriptionDetail>(`/prescriptions/${id}/open`, { method: 'POST' }),
    retry: false,
  });
}
