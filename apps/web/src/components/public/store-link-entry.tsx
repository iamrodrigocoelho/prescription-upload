'use client';

import type { PublicStoreView } from '@receita/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { LoadingState, StoreUnavailableState } from './state-screens';
import { SubmissionForm } from './submission-form';

/** Entrada pelo link da loja /l/{slug} (PRD §6.2). */
export function StoreLinkEntry({
  slug,
  siteKey,
  nonce,
}: {
  slug: string;
  siteKey: string;
  nonce?: string;
}) {
  const [unavailable, setUnavailable] = useState(false);
  const query = useQuery({
    queryKey: ['public-store', slug],
    queryFn: () => api<PublicStoreView>(`/public/stores/${encodeURIComponent(slug)}`),
    retry: false,
  });

  useEffect(() => {
    if (query.data?.acceptsSubmissions) track('store_auto_identified', { entry: 'store_link' });
  }, [query.data]);

  if (query.isLoading) return <LoadingState />;
  // Slug inexistente usa a mesma mensagem de loja indisponível (sem microcopy nova).
  if (unavailable || query.error || !query.data?.acceptsSubmissions)
    return <StoreUnavailableState />;
  return (
    <SubmissionForm
      context={{ kind: 'store_link', slug, store: query.data }}
      siteKey={siteKey}
      nonce={nonce}
      onUnavailable={() => setUnavailable(true)}
    />
  );
}
