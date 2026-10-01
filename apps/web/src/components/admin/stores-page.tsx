'use client';

import { Permission, type Paginated, type StoreView } from '@receita/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CopyButton } from '@/components/ui/copy-button';
import { EmptyState, Spinner } from '@/components/ui/feedback';
import { SelectField, TextField } from '@/components/ui/field';
import { Pagination } from '@/components/ui/pagination';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';

export function StoresPage() {
  const { can } = useSession();
  const canManage = can(Permission.STORES_MANAGE);
  const notify = useToast();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (search) params.set('search', search);
  if (active) params.set('active', active);
  const query = useQuery({
    queryKey: ['stores', params.toString()],
    queryFn: () => api<Paginated<StoreView>>(`/admin/stores?${params.toString()}`),
  });

  const toggle = useMutation({
    mutationFn: (store: StoreView) =>
      api<StoreView>(`/admin/stores/${store.id}`, {
        method: 'PATCH',
        body: { active: !store.active },
      }),
    onSuccess: (store) => {
      notify(store.active ? 'Loja ativada.' : 'Loja desativada. Ela não aceitará novos envios.');
      void client.invalidateQueries({ queryKey: ['stores'] });
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  return (
    <>
      <PageHeader
        title="Lojas"
        description="Copie o link público de cada loja para divulgação (QR Code, WhatsApp, site)."
        actions={
          canManage ? (
            <Link
              href="/admin/lojas/importar"
              className="inline-flex min-h-11 items-center gap-2 rounded-button bg-primary px-4 text-button font-semibold text-on-primary hover:bg-primary-hover"
            >
              <Upload className="size-4" aria-hidden />
              Importar CSV
            </Link>
          ) : null
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px]">
        <TextField
          label="Buscar"
          type="search"
          placeholder="Número, nome, bairro ou cidade"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <SelectField
          label="Situação"
          value={active}
          onChange={(e) => {
            setActive(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas</option>
          <option value="true">Ativas</option>
          <option value="false">Inativas</option>
        </SelectField>
      </div>

      {query.isLoading ? <Spinner /> : null}
      {query.error ? <Alert tone="error" title={errorMessage(query.error)} /> : null}
      {query.data && query.data.items.length === 0 ? (
        <EmptyState title="Nenhuma loja encontrada">
          {canManage
            ? 'Importe a base de lojas por CSV para começar.'
            : 'Ajuste os filtros da busca.'}
        </EmptyState>
      ) : null}
      {query.data && query.data.items.length > 0 ? (
        <>
          <Table caption="Lojas">
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Nome</Th>
                <Th>Localização</Th>
                <Th>Situação</Th>
                <Th>Link público</Th>
                {canManage ? <Th>Ações</Th> : null}
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((store) => (
                <tr key={store.id}>
                  <Td className="font-mono">{store.storeNumber}</Td>
                  <Td className="font-medium">{store.storeName}</Td>
                  <Td className="text-content-secondary">
                    {[store.neighborhood, store.city, store.state].filter(Boolean).join(' · ') ||
                      '—'}
                  </Td>
                  <Td>
                    {store.active ? (
                      <StatusBadge tone="success" label="Ativa" />
                    ) : (
                      <StatusBadge tone="neutral" label="Inativa" />
                    )}
                  </Td>
                  <Td>
                    <CopyButton
                      value={store.publicUrl}
                      variant="secondary"
                      size="sm"
                      aria-label={`Copiar link público da loja ${store.storeNumber}`}
                    />
                  </Td>
                  {canManage ? (
                    <Td>
                      <ConfirmDialog
                        trigger={
                          <Button variant="tertiary" size="sm">
                            {store.active ? 'Desativar' : 'Ativar'}
                          </Button>
                        }
                        title={store.active ? 'Desativar loja?' : 'Ativar loja?'}
                        description={
                          store.active
                            ? `A loja ${store.storeNumber} deixará de aceitar novos envios de receitas, inclusive por links personalizados.`
                            : `A loja ${store.storeNumber} voltará a aceitar novos envios.`
                        }
                        confirmLabel={store.active ? 'Desativar' : 'Ativar'}
                        destructive={store.active}
                        loading={toggle.isPending}
                        onConfirm={() => toggle.mutate(store)}
                      />
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={20} total={query.data.total} onChange={setPage} />
        </>
      ) : null}
    </>
  );
}
