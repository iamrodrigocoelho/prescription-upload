'use client';

import { hasPermission, type MeResponse, type Permission } from '@receita/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

/** Sessão atual (GET /auth/me). Reflete permissões; a autorização é do backend. */
export function useSession() {
  const query = useQuery<MeResponse, ApiError>({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api<MeResponse>('/auth/me'),
    retry: false,
    staleTime: 60_000,
  });
  const me = query.data;
  return {
    me,
    isLoading: query.isLoading,
    error: query.error,
    can: (permission: Permission) => (me ? hasPermission(me.user.role, permission) : false),
  };
}

export function useRefreshSession() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ME_QUERY_KEY });
}

export function useClearSession() {
  const client = useQueryClient();
  return () => client.clear();
}
