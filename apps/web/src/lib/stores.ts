'use client';

import type { MeResponse, Paginated, StoreView } from '@receita/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface StoreOption {
  id: string;
  storeNumber: string;
  storeName: string;
  active: boolean;
}

/**
 * Lojas disponíveis para seleção no escopo do usuário. Para não-admins vêm do
 * próprio /auth/me; para o Admin, da API (até 100 por busca).
 */
export function useStoreOptions(me: MeResponse | undefined, search = '') {
  const isGlobal = me?.storeScope.global === true;
  const query = useQuery({
    queryKey: ['stores', 'options', search],
    queryFn: () =>
      api<Paginated<StoreView>>(
        `/admin/stores?pageSize=100${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
    enabled: isGlobal,
  });
  if (!me) return { options: [] as StoreOption[], isLoading: true };
  if (me.storeScope.global) return { options: query.data?.items ?? [], isLoading: query.isLoading };
  return { options: me.storeScope.stores, isLoading: false };
}

export function storeLabel(store: { storeNumber: string; storeName: string }): string {
  return `${store.storeNumber} · ${store.storeName}`;
}
