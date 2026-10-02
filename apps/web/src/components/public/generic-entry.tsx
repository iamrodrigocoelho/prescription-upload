'use client';

import type { PublicStoreSearchItem } from '@receita/shared';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import { track } from '@/lib/analytics';
import { cx } from '@/lib/cx';
import { StoreUnavailableState } from './state-screens';
import { SubmissionForm } from './submission-form';

/** Entrada genérica (PRD §6.3): seleção de loja por busca antes do formulário. */
export function GenericEntry({ siteKey, nonce }: { siteKey: string; nonce?: string }) {
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PublicStoreSearchItem | null>(null);
  const [confirmed, setConfirmed] = useState<PublicStoreSearchItem | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const query = useQuery({
    queryKey: ['public-store-search', search],
    queryFn: () =>
      api<{ items: PublicStoreSearchItem[] }>(
        `/public/stores?search=${encodeURIComponent(search)}`,
      ),
    enabled: search.length >= 2,
  });

  if (unavailable) return <StoreUnavailableState />;

  if (confirmed) {
    return (
      <SubmissionForm
        context={{
          kind: 'generic',
          storeId: confirmed.id,
          store: confirmed,
          onChangeStore: () => setConfirmed(null),
        }}
        siteKey={siteKey}
        nonce={nonce}
        onUnavailable={() => setUnavailable(true)}
      />
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSelected(null);
    setSearch(term.trim());
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 font-semibold">Envio de receita</h1>
        <p className="text-body text-content-secondary">
          Selecione a loja para onde deseja enviar a receita.
        </p>
      </div>
      <form
        onSubmit={submit}
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        role="search"
      >
        <div className="flex-1">
          <TextField
            label="Buscar loja"
            hint="Número, nome, bairro ou endereço"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={term.trim().length < 2}>
          <Search className="size-4" aria-hidden />
          Buscar
        </Button>
      </form>

      {query.error ? <Alert tone="error" title={errorMessage(query.error)} /> : null}
      {query.data ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label font-medium">Lojas encontradas</legend>
          {query.data.items.length === 0 ? (
            <p role="status" className="text-body-sm text-content-muted">
              Nenhuma loja encontrada. Tente outro termo.
            </p>
          ) : (
            query.data.items.map((store) => (
              <label
                key={store.id}
                className={cx(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-card border p-3 text-body-sm',
                  selected?.id === store.id
                    ? 'border-primary bg-selected'
                    : 'border-line hover:bg-hover',
                )}
              >
                <input
                  type="radio"
                  name="loja"
                  checked={selected?.id === store.id}
                  onChange={() => setSelected(store)}
                  className="size-4 accent-primary"
                />
                <span>
                  <span className="font-semibold">
                    {store.storeNumber} · {store.storeName}
                  </span>
                  {store.neighborhood || store.city ? (
                    <span className="block text-caption text-content-muted">
                      {[store.neighborhood, store.city].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </span>
              </label>
            ))
          )}
        </fieldset>
      ) : null}

      <Button
        disabled={!selected}
        onClick={() => {
          track('store_selected', { entry: 'generic' });
          setConfirmed(selected);
        }}
      >
        Continuar
      </Button>
    </div>
  );
}
