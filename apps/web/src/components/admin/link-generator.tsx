'use client';

import {
  type CreatePatientLinkResponse,
  type PatientLinkOptions,
  type PatientSearchResult,
} from '@receita/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { SelectField } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { storeLabel, useStoreOptions } from '@/lib/stores';
import { PatientSearch } from './patients/patient-search';

/**
 * Geração de link personalizado (DESIGN.md §8.6 / §13.4): loja → paciente →
 * validade → gerar → copiar. A URL (com o token) existe apenas na memória
 * deste componente e não é exibida novamente.
 */
export function LinkGenerator() {
  const { me } = useSession();
  const { options: stores } = useStoreOptions(me);
  const activeStores = stores.filter((store) => store.active);
  const [storeId, setStoreId] = useState('');
  const [searchKey, setSearchKey] = useState(0);
  const [selected, setSelected] = useState<PatientSearchResult | null>(null);
  const [days, setDays] = useState<number | null>(null);

  const optionsQuery = useQuery({
    queryKey: ['patient-links', 'options'],
    queryFn: () => api<PatientLinkOptions>('/admin/patient-links/options'),
  });
  const effectiveStoreId =
    storeId || (activeStores.length === 1 ? (activeStores[0]?.id ?? '') : '');
  const effectiveDays = days ?? optionsQuery.data?.defaultExpiryDays ?? 7;

  const generate = useMutation({
    mutationFn: () =>
      api<CreatePatientLinkResponse>('/admin/patient-links', {
        method: 'POST',
        body: {
          storeId: effectiveStoreId,
          selectionRef: selected?.selectionRef,
          expiresInDays: effectiveDays,
        },
      }),
  });

  function reset() {
    generate.reset();
    setSelected(null);
    // Remonta a busca: uma seleção já usada não vale para o próximo link.
    setSearchKey((key) => key + 1);
  }

  if (generate.data) {
    const { link, url } = generate.data;
    return (
      <>
        <PageHeader title="Link gerado" />
        <Card className="flex max-w-2xl flex-col gap-4">
          <Alert tone="success" title="Link pronto para envio">
            <p>
              {link.patientLabel} · {storeLabel(link.store)} · válido até{' '}
              {formatDateTime(link.expiresAt)}.
            </p>
          </Alert>
          <CopyButton value={url} className="self-start" />
          <div className="flex flex-col gap-1">
            <label htmlFor="link-gerado" className="text-caption text-content-muted">
              Link (envie ao paciente por WhatsApp, e-mail ou outro canal)
            </label>
            <input
              id="link-gerado"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full truncate rounded-input border border-line bg-subtle px-3 py-2 font-mono text-caption text-content-secondary"
            />
          </div>
          <Alert tone="warning">
            <p>
              Por segurança, este link não será exibido novamente. Se precisar reenviá-lo e não
              tiver a cópia, revogue este link e gere um novo.
            </p>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={reset}>
              Gerar outro link
            </Button>
            <Link
              href="/admin/links"
              className="inline-flex min-h-11 items-center px-4 text-button text-link underline"
            >
              Ver links gerados
            </Link>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Gerar link para envio de receita" />
      <Card className="flex max-w-2xl flex-col gap-6">
        <SelectField
          label="Loja"
          value={effectiveStoreId}
          onChange={(e) => setStoreId(e.target.value)}
          hint={activeStores.length === 0 ? 'Nenhuma loja ativa no seu acesso.' : undefined}
        >
          <option value="">Selecione a loja</option>
          {activeStores.map((store) => (
            <option key={store.id} value={store.id}>
              {storeLabel(store)}
            </option>
          ))}
        </SelectField>

        <PatientSearch
          key={searchKey}
          context={effectiveStoreId ? { storeId: effectiveStoreId } : null}
          selectedRef={selected?.selectionRef ?? null}
          onSelect={setSelected}
          disabledHint="Selecione a loja para buscar o paciente."
        />

        <SelectField
          label="Validade"
          value={String(effectiveDays)}
          onChange={(e) => setDays(Number(e.target.value))}
          hint="Após o envio da receita, o link deixa de funcionar."
        >
          {(optionsQuery.data?.expiryOptions ?? [7]).map((value) => (
            <option key={value} value={value}>
              {value === 1 ? '1 dia' : `${value} dias`}
            </option>
          ))}
        </SelectField>

        {generate.error ? <Alert tone="error" title={errorMessage(generate.error)} /> : null}
        <Button
          loading={generate.isPending}
          disabled={!effectiveStoreId || !selected}
          onClick={() => generate.mutate()}
          className="self-start"
        >
          Gerar link
        </Button>
      </Card>
    </>
  );
}
