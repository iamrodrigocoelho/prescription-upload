'use client';

import {
  formatCpf,
  type PatientSearchContext,
  type PatientSearchResult,
  type PatientSearchType,
} from '@receita/shared';
import { useMutation } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cx } from '@/lib/cx';

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

export const PATIENTS_UNAVAILABLE_TEXT =
  'A consulta de pacientes está temporariamente indisponível. Tente novamente em instantes.';

export function patientSearchErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'VALIDATION_FAILED') return error.issues[0]?.message ?? error.message;
    if (error.code === 'SERVICE_UNAVAILABLE') return PATIENTS_UNAVAILABLE_TEXT;
    if (error.code === 'RATE_LIMITED') {
      return 'Muitas buscas em pouco tempo. Aguarde alguns instantes e tente novamente.';
    }
  }
  return errorMessage(error);
}

interface PatientSearchProps {
  /** Contexto da busca (receita ou loja). Sem contexto, a busca fica desabilitada. */
  context: PatientSearchContext | null;
  selectedRef: string | null;
  onSelect: (patient: PatientSearchResult | null) => void;
  /** Explica por que a busca está desabilitada (ex.: "Selecione a loja"). */
  disabledHint?: string;
  /** Recebe o foco ao montar (uso em modal). */
  autoFocus?: boolean;
}

/**
 * Busca de paciente por CPF, telefone ou e-mail (DESIGN §8.5, §13.4) com resultados
 * mínimos e mascarados. Cada resultado carrega só uma referência opaca de seleção.
 * Compartilhada entre "Vincular paciente" e a geração de link personalizado.
 */
export function PatientSearch({
  context,
  selectedRef,
  onSelect,
  disabledHint,
  autoFocus,
}: PatientSearchProps) {
  const headingId = useId();
  const [searchType, setSearchType] = useState<PatientSearchType>('cpf');
  const [term, setTerm] = useState('');
  const contextKey = context ? JSON.stringify(context) : '';

  const search = useMutation({
    mutationFn: () =>
      api<{ results: PatientSearchResult[] }>('/patients/search', {
        method: 'POST',
        body: { type: searchType, query: term, context },
      }),
    onMutate: () => onSelect(null),
  });

  // Seleções valem só no contexto em que foram feitas: mudar o contexto limpa tudo.
  const { reset } = search;
  useEffect(() => {
    reset();
    onSelect(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey, reset]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (context && term.trim()) search.mutate();
  }

  const current = SEARCH_TYPES.find((type) => type.value === searchType) ?? SEARCH_TYPES[0]!;
  const results = search.data?.results;

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col gap-3" aria-labelledby={headingId}>
        <h2 id={headingId} className="text-label font-medium">
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
                onSelect(null);
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
              autoFocus={autoFocus}
              value={term}
              disabled={!context}
              hint={!context ? disabledHint : undefined}
              onChange={(e) =>
                setTerm(searchType === 'cpf' ? formatCpf(e.target.value) : e.target.value)
              }
              error={search.error ? patientSearchErrorMessage(search.error) : undefined}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            loading={search.isPending}
            disabled={!context || !term.trim()}
          >
            <Search className="size-4" aria-hidden />
            Buscar
          </Button>
        </div>
      </form>

      {/* Anuncia o andamento e a quantidade de resultados (DESIGN §12). */}
      <p role="status" aria-live="polite" className="sr-only">
        {search.isPending
          ? 'Buscando pacientes…'
          : results
            ? results.length === 0
              ? 'Nenhum paciente encontrado.'
              : `${results.length} ${results.length === 1 ? 'paciente encontrado' : 'pacientes encontrados'}.`
            : ''}
      </p>

      {results ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label font-medium">Resultado</legend>
          {results.length === 0 ? (
            <p className="text-body-sm text-content-muted">
              Nenhum paciente encontrado. Confira os dados ou tente outro tipo de busca.
            </p>
          ) : (
            results.map((patient) => {
              const isSelected = selectedRef === patient.selectionRef;
              return (
                <label
                  key={patient.selectionRef}
                  data-testid="patient-result"
                  className={cx(
                    'flex cursor-pointer items-center gap-3 rounded-card border p-3 text-body-sm',
                    isSelected ? 'border-primary bg-selected' : 'border-line hover:bg-hover',
                  )}
                >
                  <input
                    type="radio"
                    name="paciente"
                    checked={isSelected}
                    onChange={() => onSelect(patient)}
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
    </div>
  );
}
