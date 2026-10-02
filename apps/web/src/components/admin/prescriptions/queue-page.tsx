'use client';

import type { PrescriptionListResponse, RealtimeEvent } from '@receita/shared';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Table, Td, Th } from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDateTime } from '@/lib/format';
import {
  filtersFromParams,
  filtersToQuery,
  type QueueFilters as Filters,
  useCounters,
  useQueue,
} from '@/lib/prescriptions';
import { useRealtime } from '@/lib/realtime';
import { IdentificationBadge, NewBadge, OperationalBadge } from './badges';
import { QueueFilters } from './queue-filters';

function CounterChips({ filters, onPick }: { filters: Filters; onPick: (next: Filters) => void }) {
  const counters = useCounters(filters);
  const chips = [
    { label: 'Novas', value: counters.data?.new, apply: { unviewed: 'true' } },
    {
      label: 'Sem paciente',
      value: counters.data?.unidentified,
      apply: { identificationStatus: 'NOT_IDENTIFIED' },
    },
    {
      label: 'Em atendimento',
      value: counters.data?.inService,
      apply: { operationalStatus: 'IN_SERVICE' },
    },
    {
      label: 'Finalizadas',
      value: counters.data?.finished,
      apply: { operationalStatus: 'FINISHED' },
    },
  ];
  return (
    <ul className="mb-4 flex flex-wrap gap-2" aria-label="Contadores">
      {chips.map((chip) => (
        <li key={chip.label}>
          <button
            type="button"
            onClick={() =>
              onPick({
                storeId: filters.storeId,
                from: filters.from,
                to: filters.to,
                ...chip.apply,
              })
            }
            className="flex min-h-11 items-center gap-2 rounded-card border border-line bg-surface px-3 text-body-sm hover:bg-hover"
          >
            <span className="text-content-secondary">{chip.label}</span>
            <span className="text-h3 font-semibold text-content" aria-live="polite">
              {chip.value ?? '–'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SkeletonRows() {
  return (
    <div role="status" aria-label="Carregando receitas" className="flex flex-col gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-card bg-subtle" />
      ))}
    </div>
  );
}

/** Fila operacional (PRD §12, DESIGN §8.3/§13.5) com atualização em tempo real. */
export function QueuePage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(params.toString())),
    [params],
  );
  const queue = useQueue(filters);
  const client = useQueryClient();
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [pendingNew, setPendingNew] = useState(0);

  const setFilters = (next: Filters) => {
    const query = filtersToQuery(next);
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const onEvent = useCallback(
    (event: RealtimeEvent) => {
      const queueKey = ['prescriptions', 'queue', filtersToQuery(filters)];
      if (event.type === 'prescription.created') {
        const pages =
          client.getQueryData<InfiniteData<PrescriptionListResponse>>(queueKey)?.pages.length ?? 1;
        if (pages > 1 || filters.sort === 'asc') {
          // Navegando em páginas posteriores: avisa em vez de deslocar a lista.
          setPendingNew((n) => n + 1);
        } else {
          setHighlighted((current) => new Set(current).add(event.prescriptionId));
          void client.invalidateQueries({ queryKey: queueKey });
        }
      }
      if (event.type === 'prescription.viewed' || event.type === 'prescription.status_changed') {
        client.setQueryData<InfiniteData<PrescriptionListResponse>>(queueKey, (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) =>
                    item.id !== event.prescriptionId
                      ? item
                      : event.type === 'prescription.viewed'
                        ? { ...item, isNew: false }
                        : { ...item, operationalStatus: event.operationalStatus },
                  ),
                })),
              }
            : data,
        );
      }
      // A identificação mudou (automática ou manual): recarrega para trazer o rótulo.
      if (event.type === 'prescription.patient_linked') {
        void client.invalidateQueries({ queryKey: queueKey });
      }
      if (event.type === 'counters.updated')
        void client.invalidateQueries({ queryKey: ['prescriptions', 'counters'] });
    },
    [client, filters],
  );
  useRealtime(onEvent);

  const items = queue.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageHeader
        title="Receitas"
        description="Receitas recebidas nas lojas do seu acesso, atualizadas em tempo real."
      />
      <CounterChips filters={filters} onPick={setFilters} />
      <QueueFilters filters={filters} onChange={setFilters} />

      {pendingNew > 0 ? (
        <Alert tone="info" className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              {pendingNew === 1 ? 'Há 1 nova receita.' : `Há ${pendingNew} novas receitas.`}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setPendingNew(0);
                void client.resetQueries({ queryKey: ['prescriptions', 'queue'] });
                window.scrollTo({ top: 0 });
              }}
            >
              Mostrar novas receitas
            </Button>
          </div>
        </Alert>
      ) : null}

      {queue.isLoading ? <SkeletonRows /> : null}
      {queue.error ? (
        <Alert tone="error" title={errorMessage(queue.error)}>
          <Button size="sm" variant="secondary" onClick={() => void queue.refetch()}>
            Tentar novamente
          </Button>
        </Alert>
      ) : null}
      {queue.data && items.length === 0 ? (
        <EmptyState title="Nenhuma receita encontrada">
          Ajuste os filtros ou aguarde novos envios.
        </EmptyState>
      ) : null}

      {items.length > 0 ? (
        <>
          <Table caption="Fila de receitas">
            <thead>
              <tr>
                <Th>Recebida em</Th>
                <Th>Loja</Th>
                <Th>Paciente</Th>
                <Th>Status</Th>
                <Th>Identificação</Th>
                <Th>Arquivos</Th>
                <Th>
                  <span className="sr-only">Ação</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  data-testid="queue-row"
                  data-new={item.isNew || undefined}
                  className={cx(
                    item.isNew && 'border-l-4 border-l-primary bg-selected',
                    highlighted.has(item.id) && 'outline outline-2 outline-focus',
                  )}
                >
                  <Td className="whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      {formatDateTime(item.receivedAt)}
                      {item.isNew ? <NewBadge /> : null}
                    </div>
                  </Td>
                  <Td>
                    <span className="font-mono">{item.store.storeNumber}</span>
                    <span className="block text-caption text-content-muted">
                      {item.store.storeName}
                    </span>
                  </Td>
                  <Td>
                    {item.patientLabel ?? (
                      <span className="text-content-muted">Não identificado</span>
                    )}
                    {item.cpfMasked ? (
                      <span className="block font-mono text-caption text-content-muted">
                        CPF {item.cpfMasked}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <OperationalBadge status={item.operationalStatus} />
                  </Td>
                  <Td>
                    <IdentificationBadge status={item.identificationStatus} />
                  </Td>
                  <Td className="text-center">{item.fileCount}</Td>
                  <Td>
                    <Link
                      href={`/admin/receitas/${item.id}`}
                      className="inline-flex min-h-9 items-center rounded-button px-3 font-semibold text-link underline hover:bg-hover"
                      aria-label={`Abrir receita recebida em ${formatDateTime(item.receivedAt)}`}
                    >
                      Abrir
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {queue.hasNextPage ? (
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                loading={queue.isFetchingNextPage}
                onClick={() => void queue.fetchNextPage()}
              >
                Carregar mais
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
