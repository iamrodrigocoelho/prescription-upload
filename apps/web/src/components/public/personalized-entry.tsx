'use client';

import type { PublicPatientLinkContext } from '@receita/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { LinkUnavailableState, LoadingState } from './state-screens';
import { SubmissionForm } from './submission-form';

/**
 * Entrada pelo link personalizado (PRD §6.6, D-047). Com `token`, troca-o por um
 * contexto em cookie e remove o token da barra de endereço/histórico ANTES de
 * carregar o formulário (e o reCAPTCHA). Sem `token` (/p), usa o contexto atual.
 */
export function PersonalizedEntry({
  token,
  siteKey,
  nonce,
}: {
  token?: string;
  siteKey: string;
  nonce?: string;
}) {
  const [store, setStore] = useState<PublicPatientLinkContext | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const request = token
      ? api<PublicPatientLinkContext>('/public/patient-link-sessions', {
          method: 'POST',
          body: { token },
        })
      : api<PublicPatientLinkContext>('/public/patient-link-sessions/current');
    // Remove o token da URL imediatamente, mesmo que a validação falhe.
    if (token) window.history.replaceState(null, '', '/p');
    request
      .then((context) => {
        setStore(context);
        setState('ready');
        track('personalized_link_opened', {});
      })
      .catch(() => {
        setState('unavailable');
        track('personalized_link_invalid', {});
      });
  }, [token]);

  if (state === 'loading') return <LoadingState />;
  if (state === 'unavailable' || !store) return <LinkUnavailableState />;
  return (
    <SubmissionForm
      context={{ kind: 'personalized', store }}
      siteKey={siteKey}
      nonce={nonce}
      onUnavailable={() => setState('unavailable')}
    />
  );
}
