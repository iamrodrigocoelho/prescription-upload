'use client';

import {
  type DashboardPeriod,
  type DashboardSummary,
  type DurationStat,
  OPERATIONAL_STATUS_LABELS,
  type RealtimeEvent,
} from '@receita/shared';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useId, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState, Spinner } from '@/components/ui/feedback';
import { SelectField, TextField } from '@/components/ui/field';
import { Table, Td, Th } from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { cx } from '@/lib/cx';
import {
  type DashboardFilters,
  dashboardFiltersFromParams,
  dashboardFiltersToQuery,
  formatDay,
  formatDuration,
  useDashboard,
} from '@/lib/dashboard';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { storeLabel, useStoreOptions } from '@/lib/stores';
import { BarList, ChartCard, LineChart } from './charts';

const PERIOD_OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'custom', label: 'Personalizado' },
];

/** Atualização por tempo real com intervalo mínimo (evita recarga a cada evento). */
const REFRESH_MIN_INTERVAL_MS = 15_000;

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId}>
      <Card className="flex h-full flex-col gap-1">
        <p id={labelId} className="text-label text-content-muted">
          {label}
        </p>
        <p className="text-display font-semibold tabular-nums" data-testid="kpi-value">
          {value}
        </p>
        {hint ? <p className="text-caption text-content-muted">{hint}</p> : null}
      </Card>
    </div>
  );
}

function Timing({ label, stat }: { label: string; stat: DurationStat }) {
  return (
    <div className="flex flex-col gap-1 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <p className="text-label font-medium">{label}</p>
      {stat.count === 0 ? (
        <p className="text-body-sm text-content-muted">Sem receitas suficientes no período.</p>
      ) : (
        <dl className="grid grid-cols-3 gap-2 text-body-sm">
          <div>
            <dt className="text-caption text-content-muted">Mediana</dt>
            <dd className="font-semibold">{formatDuration(stat.medianSeconds)}</dd>
          </div>
          <div>
            <dt className="text-caption text-content-muted">90% em até</dt>
            <dd className="font-semibold">{formatDuration(stat.p90Seconds)}</dd>
          </div>
          <div>
            <dt className="text-caption text-content-muted">Receitas</dt>
            <dd className="font-semibold tabular-nums">{stat.count}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function CountList({ items }: { items: { label: string; value: number }[] }) {
  return (
    <dl className="flex flex-col gap-2 text-body-sm">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-4">
          <dt>{item.label}</dt>
          <dd className="font-semibold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function rangeText(summary: DashboardSummary | undefined): string {
  if (!summary) return 'Acompanhamento do volume de receitas.';
  const { from, to, timezone } = summary.range;
  const period = from === to ? `em ${formatDay(from)}` : `de ${formatDay(from)} a ${formatDay(to)}`;
  const zone = timezone === 'America/Sao_Paulo' ? 'horário de Brasília' : `fuso ${timezone}`;
  return `Receitas recebidas ${period} (${zone}).`;
}

/** Dashboard operacional e gerencial (PRD §18; DESIGN §8.8), sempre no escopo do usuário. */
export function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = dashboardFiltersFromParams(new URLSearchParams(params.toString()));
  const { me } = useSession();
  const { options: stores } = useStoreOptions(me);
  const data = useDashboard(filters);
  const client = useQueryClient();
  const [customFrom, setCustomFrom] = useState(filters.from ?? '');
  const [customTo, setCustomTo] = useState(filters.to ?? '');

  const setFilters = (next: DashboardFilters) => {
    const query = dashboardFiltersToQuery(next);
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  // Tempo real: contadores mudaram → recarrega o dashboard, no máximo a cada 15 s.
  const lastRefresh = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.type !== 'counters.updated' || pending.current) return;
      const wait = Math.max(0, lastRefresh.current + REFRESH_MIN_INTERVAL_MS - Date.now());
      pending.current = setTimeout(() => {
        pending.current = null;
        lastRefresh.current = Date.now();
        void client.invalidateQueries({ queryKey: ['dashboard'] });
      }, wait);
    },
    [client],
  );
  useRealtime(onEvent);

  function applyCustom(event: FormEvent) {
    event.preventDefault();
    if (customFrom && customTo) {
      setFilters({ ...filters, period: 'custom', from: customFrom, to: customTo });
    }
  }

  const summary = data.summary.data;
  const error =
    data.summary.error ?? data.timeseries.error ?? data.byStatus.error ?? data.byStore.error;
  const pendingStores =
    data.byStore.data?.items
      .filter((row) => row.unviewed > 0 || row.open > 0 || row.unidentified > 0)
      .sort((a, b) => b.unviewed - a.unviewed || b.open - a.open) ?? [];

  return (
    <>
      <PageHeader title="Dashboard" description={rangeText(summary)} />

      <Card className="mb-6 flex flex-col gap-4">
        <div role="radiogroup" aria-label="Período" className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={filters.period === option.value}
              onClick={() =>
                option.value === 'custom'
                  ? setFilters({ ...filters, period: 'custom' })
                  : setFilters({ period: option.value, storeId: filters.storeId })
              }
              className={cx(
                'min-h-9 rounded-button border px-3 text-body-sm font-medium',
                filters.period === option.value
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-line-strong bg-surface text-content hover:bg-hover',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {filters.period === 'custom' ? (
          <form onSubmit={applyCustom} className="flex flex-wrap items-end gap-3">
            <TextField
              label="De"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <TextField
              label="Até"
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={!customFrom || !customTo}>
              Aplicar período
            </Button>
          </form>
        ) : null}
        {stores.length > 1 ? (
          <div className="max-w-sm">
            <SelectField
              label="Loja"
              value={filters.storeId ?? ''}
              onChange={(e) => setFilters({ ...filters, storeId: e.target.value || undefined })}
            >
              <option value="">Todas as lojas do meu acesso</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {storeLabel(store)}
                </option>
              ))}
            </SelectField>
          </div>
        ) : null}
      </Card>

      {error ? <Alert tone="error" title={errorMessage(error)} /> : null}

      {data.summary.isLoading ? (
        <Spinner />
      ) : summary ? (
        <div className="flex flex-col gap-6">
          <section
            aria-label="Indicadores principais"
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            <Kpi label="Recebidas hoje" value={summary.receivedToday} />
            <Kpi label="Recebidas no período" value={summary.receivedInPeriod} />
            <Kpi label="Não visualizadas" value={summary.unviewed} hint="Recebidas no período" />
            <Kpi
              label="Sem paciente identificado"
              value={summary.unidentified}
              hint="Recebidas no período"
            />
            <Kpi label="Finalizadas" value={summary.finished} />
            <Kpi label="Canceladas" value={summary.cancelled} />
            <Kpi label="Não atendidas" value={summary.notServed} />
            <Kpi
              label="Envios por link personalizado"
              value={summary.personalizedLinkSubmissions}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Identificação do paciente">
              <CountList
                items={[
                  { label: 'Automaticamente por CPF', value: summary.identifiedAuto },
                  { label: 'Manualmente', value: summary.identifiedManual },
                  { label: 'Por link personalizado', value: summary.identifiedPersonalizedLink },
                  { label: 'Não identificadas', value: summary.unidentified },
                ]}
              />
            </ChartCard>
            {summary.links ? (
              <ChartCard
                title="Links personalizados"
                description="Ativos agora; utilizados e expirados no período."
              >
                <CountList
                  items={[
                    { label: 'Ativos', value: summary.links.active },
                    { label: 'Utilizados', value: summary.links.used },
                    { label: 'Expirados', value: summary.links.expired },
                  ]}
                />
              </ChartCard>
            ) : null}
            <ChartCard
              title="Tempos de atendimento"
              description="Informativo, sem meta de prazo. Contados a partir do recebimento."
            >
              <Timing label="Até a primeira visualização" stat={summary.timings.toFirstView} />
              <Timing
                label="Até a identificação do paciente"
                stat={summary.timings.toIdentification}
              />
              <Timing label="Até a finalização" stat={summary.timings.toFinalization} />
            </ChartCard>
          </div>

          <ChartCard title="Volume por dia">
            {data.timeseries.data ? (
              summary.receivedInPeriod === 0 ? (
                <EmptyState title="Nenhuma receita no período" />
              ) : (
                <LineChart
                  label="Receitas recebidas e finalizadas por dia"
                  days={data.timeseries.data.days.map((day) => ({
                    date: day.date,
                    values: { received: day.received, finished: day.finished },
                  }))}
                  series={[
                    {
                      key: 'received',
                      label: 'Recebidas',
                      strokeClass: 'stroke-chart-1',
                      fillClass: 'fill-chart-1',
                    },
                    {
                      key: 'finished',
                      label: 'Finalizadas',
                      strokeClass: 'stroke-chart-2',
                      fillClass: 'fill-chart-2',
                      dashed: true,
                    },
                  ]}
                />
              )
            ) : (
              <Spinner />
            )}
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Receitas por status"
              description="Status atual das receitas recebidas no período."
            >
              {data.byStatus.data ? (
                <BarList
                  label="Receitas por status"
                  items={data.byStatus.data.items.map((item) => ({
                    key: item.status,
                    label: OPERATIONAL_STATUS_LABELS[item.status],
                    value: item.count,
                  }))}
                />
              ) : (
                <Spinner />
              )}
            </ChartCard>
            {data.byStore.data && data.byStore.data.items.length > 1 ? (
              <ChartCard
                title="Volume por loja"
                description="As 10 lojas com mais receitas no período."
              >
                <BarList
                  label="Volume por loja"
                  items={data.byStore.data.items.slice(0, 10).map((row) => ({
                    key: row.store.id,
                    label: storeLabel(row.store),
                    value: row.received,
                  }))}
                />
              </ChartCard>
            ) : null}
          </div>

          <ChartCard
            title="Lojas com pendências"
            description="Receitas do período ainda não visualizadas, sem paciente ou em aberto."
          >
            {pendingStores.length === 0 ? (
              <p className="text-body-sm text-content-muted">Nenhuma pendência no período.</p>
            ) : (
              <Table caption="Lojas com pendências">
                <thead>
                  <tr>
                    <Th>Loja</Th>
                    <Th className="text-right">Recebidas</Th>
                    <Th className="text-right">Não visualizadas</Th>
                    <Th className="text-right">Sem paciente</Th>
                    <Th className="text-right">Em aberto</Th>
                  </tr>
                </thead>
                <tbody>
                  {pendingStores.map((row) => (
                    <tr key={row.store.id}>
                      <Td>
                        <Link
                          href={`/admin/receitas?storeId=${row.store.id}`}
                          className="text-link underline"
                        >
                          {storeLabel(row.store)}
                        </Link>
                      </Td>
                      <Td className="text-right tabular-nums">{row.received}</Td>
                      <Td className="text-right tabular-nums">{row.unviewed}</Td>
                      <Td className="text-right tabular-nums">{row.unidentified}</Td>
                      <Td className="text-right tabular-nums">{row.open}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </ChartCard>
        </div>
      ) : null}
    </>
  );
}
