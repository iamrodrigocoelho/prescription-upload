'use client';

import {
  IDENTIFICATION_STATUS_LABELS,
  type IdentificationStatus,
  OPERATIONAL_STATUS_LABELS,
  type OperationalStatus,
  SOURCE_CHANNEL_LABELS,
  type SourceChannel,
} from '@receita/shared';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import type { QueueFilters } from '@/lib/prescriptions';
import { useSession } from '@/lib/session';
import { storeLabel, useStoreOptions } from '@/lib/stores';

const toDate = (iso?: string) => (iso ? iso.slice(0, 10) : '');
// Período em horário de Brasília (o servidor recebe ISO com offset).
const fromDate = (value: string) => (value ? `${value}T00:00:00-03:00` : '');
const toDateEnd = (value: string) => (value ? `${value}T23:59:59-03:00` : '');

/** Filtros próximos à tabela, refletidos na URL; quebram em várias linhas (DESIGN §5.3). */
export function QueueFilters({
  filters,
  onChange,
}: {
  filters: QueueFilters;
  onChange: (next: QueueFilters) => void;
}) {
  const { me } = useSession();
  const { options: stores } = useStoreOptions(me);
  const set = (key: keyof QueueFilters, value: string) =>
    onChange({ ...filters, [key]: value || undefined });
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <form
      aria-label="Filtros da fila"
      onSubmit={(event) => event.preventDefault()}
      className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <SelectField
        label="Loja"
        value={filters.storeId ?? ''}
        onChange={(e) => set('storeId', e.target.value)}
      >
        <option value="">Todas do meu acesso</option>
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {storeLabel(store)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Status"
        value={filters.operationalStatus ?? ''}
        onChange={(e) => set('operationalStatus', e.target.value)}
      >
        <option value="">Todos</option>
        {(Object.keys(OPERATIONAL_STATUS_LABELS) as OperationalStatus[]).map((status) => (
          <option key={status} value={status}>
            {OPERATIONAL_STATUS_LABELS[status]}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Identificação"
        value={filters.identificationStatus ?? ''}
        onChange={(e) => set('identificationStatus', e.target.value)}
      >
        <option value="">Todas</option>
        {(Object.keys(IDENTIFICATION_STATUS_LABELS) as IdentificationStatus[]).map((status) => (
          <option key={status} value={status}>
            {IDENTIFICATION_STATUS_LABELS[status]}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Origem"
        value={filters.sourceChannel ?? ''}
        onChange={(e) => set('sourceChannel', e.target.value)}
      >
        <option value="">Todas</option>
        {(Object.keys(SOURCE_CHANNEL_LABELS) as SourceChannel[]).map((channel) => (
          <option key={channel} value={channel}>
            {SOURCE_CHANNEL_LABELS[channel]}
          </option>
        ))}
      </SelectField>
      <TextField
        label="De"
        type="date"
        value={toDate(filters.from)}
        onChange={(e) => set('from', fromDate(e.target.value))}
      />
      <TextField
        label="Até"
        type="date"
        value={toDate(filters.to)}
        onChange={(e) => set('to', toDateEnd(e.target.value))}
      />
      <SelectField
        label="CPF"
        value={filters.hasCpf ?? ''}
        onChange={(e) => set('hasCpf', e.target.value)}
      >
        <option value="">Com ou sem CPF</option>
        <option value="true">Com CPF</option>
        <option value="false">Sem CPF</option>
      </SelectField>
      <SelectField
        label="Paciente"
        value={filters.linked ?? ''}
        onChange={(e) => set('linked', e.target.value)}
      >
        <option value="">Vinculado ou não</option>
        <option value="true">Vinculado</option>
        <option value="false">Não vinculado</option>
      </SelectField>
      <SelectField
        label="Visualização"
        value={filters.unviewed ?? ''}
        onChange={(e) => set('unviewed', e.target.value)}
      >
        <option value="">Todas</option>
        <option value="true">Somente novas</option>
        <option value="false">Já visualizadas</option>
      </SelectField>
      <SelectField
        label="Ordenação"
        value={filters.sort ?? 'desc'}
        onChange={(e) => set('sort', e.target.value === 'desc' ? '' : e.target.value)}
      >
        <option value="desc">Mais recentes</option>
        <option value="asc">Mais antigas</option>
      </SelectField>
      {hasFilters ? (
        <div className="flex items-end">
          <Button variant="tertiary" onClick={() => onChange({})}>
            Limpar filtros
          </Button>
        </div>
      ) : null}
    </form>
  );
}
