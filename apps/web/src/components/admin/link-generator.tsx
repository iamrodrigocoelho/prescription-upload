'use client';

import {
  type CreatePatientLinkResponse,
  formatCpf,
  type PatientLinkOptions,
  type PatientSearchResult,
  type PatientSearchType,
} from '@receita/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { SelectField, TextField } from '@/components/ui/field';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { storeLabel, useStoreOptions } from '@/lib/stores';

const SEARCH_TYPES: {
  value: PatientSearchType;
  label: string;
  placeholder: string;
  inputMode: 'numeric' | 'tel' | 'email';
}[] = [
  { value: 'cpf', label: 'CPF', placeholder: '000.000.000-00', inputMode: 'numeric' },
  { value: 'phone', label: 'Telefone', placeholder: '(21) 90000-0000', inputMode: 'tel' },
  { value: 'email', label: 'E-mail', placeholder: 'paciente@exemplo.com', inputMode: 'email' },
];

function searchErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'VALIDATION_FAILED')
    return error.issues[0]?.message ?? error.message;
  if (error instanceof ApiError && error.code === 'SERVICE_UNAVAILABLE') {
    return 'A consulta de pacientes está temporariamente indisponível. Tente novamente em instantes.';
  }
  return errorMessage(error);
}

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
  const [searchType, setSearchType] = useState<PatientSearchType>('cpf');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<PatientSearchResult | null>(null);
  const [days, setDays] = useState<number | null>(null);

  const optionsQuery = useQuery({
    queryKey: ['patient-links', 'options'],
    queryFn: () => api<PatientLinkOptions>('/admin/patient-links/options'),
  });
  const effectiveStoreId =
    storeId || (activeStores.length === 1 ? (activeStores[0]?.id ?? '') : '');
  const effectiveDays = days ?? optionsQuery.data?.defaultExpiryDays ?? 7;

  const search = useMutation({
    mutationFn: () =>
      api<{ results: PatientSearchResult[] }>('/patients/search', {
        method: 'POST',
        body: { type: searchType, query: term },
      }),
    onSuccess: () => setSelected(null),
  });
  const generate = useMutation({
    mutationFn: () =>
      api<CreatePatientLinkResponse>('/admin/patient-links', {
        method: 'POST',
        body: {
          storeId: effectiveStoreId,
          patientExternalId: selected?.externalId,
          expiresInDays: effectiveDays,
        },
      }),
  });

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (term.trim()) search.mutate();
  }

  function reset() {
    generate.reset();
    search.reset();
    setSelected(null);
    setTerm('');
  }

  const current = SEARCH_TYPES.find((type) => type.value === searchType) ?? SEARCH_TYPES[0]!;

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

        <form
          onSubmit={submitSearch}
          className="flex flex-col gap-3"
          aria-labelledby="buscar-paciente"
        >
          <h2 id="buscar-paciente" className="text-label font-medium">
            Buscar paciente
          </h2>
          <div role="radiogroup" aria-label="Buscar por" className="flex flex-wrap gap-2">
            {SEARCH_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                role="radio"
                aria-checked={searchType === type.value}
                onClick={() => {
                  setSearchType(type.value);
                  setTerm('');
                  search.reset();
                }}
                className={cx(
                  'min-h-9 rounded-button border px-3 text-body-sm font-medium',
                  searchType === type.value
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-line-strong bg-surface text-content hover:bg-hover',
                )}
              >
                {type.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <TextField
                label={current.label}
                inputMode={current.inputMode}
                placeholder={current.placeholder}
                autoComplete="off"
                value={term}
                onChange={(e) =>
                  setTerm(searchType === 'cpf' ? formatCpf(e.target.value) : e.target.value)
                }
                error={search.error ? searchErrorMessage(search.error) : undefined}
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              loading={search.isPending}
              disabled={!term.trim()}
            >
              <Search className="size-4" aria-hidden />
              Buscar
            </Button>
          </div>
        </form>

        {search.data ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-label font-medium">Resultado</legend>
            {search.data.results.length === 0 ? (
              <p role="status" className="text-body-sm text-content-muted">
                Nenhum paciente encontrado. Confira os dados ou tente outro tipo de busca.
              </p>
            ) : (
              search.data.results.map((patient) => {
                const isSelected = selected?.externalId === patient.externalId;
                return (
                  <label
                    key={patient.externalId}
                    className={cx(
                      'flex cursor-pointer items-center gap-3 rounded-card border p-3 text-body-sm',
                      isSelected ? 'border-primary bg-selected' : 'border-line hover:bg-hover',
                    )}
                  >
                    <input
                      type="radio"
                      name="paciente"
                      checked={isSelected}
                      onChange={() => setSelected(patient)}
                      className="size-4 accent-primary"
                    />
                    <span className="flex flex-wrap gap-x-4 gap-y-1">
                      <span className="font-semibold">{patient.displayName}</span>
                      <span>CPF {patient.cpfMasked}</span>
                      {patient.phoneMasked ? <span>Tel. {patient.phoneMasked}</span> : null}
                      {patient.emailMasked ? <span>{patient.emailMasked}</span> : null}
                    </span>
                  </label>
                );
              })
            )}
          </fieldset>
        ) : null}

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
