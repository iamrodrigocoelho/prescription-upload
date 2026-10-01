'use client';

import { type Paginated, type PatientLinkView, PatientUploadLinkStatus } from '@receita/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, Spinner } from '@/components/ui/feedback';
import { SelectField } from '@/components/ui/field';
import { Pagination } from '@/components/ui/pagination';
import { Table, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { LINK_STATUS_LABELS } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { storeLabel, useStoreOptions } from '@/lib/stores';
import { LinkStatusBadge } from './link-status-badge';

export function LinksPage() {
  const { me } = useSession();
  const { options: stores } = useStoreOptions(me);
  const notify = useToast();
  const client = useQueryClient();
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (storeId) params.set('storeId', storeId);
  if (status) params.set('status', status);
  const query = useQuery({
    queryKey: ['patient-links', params.toString()],
    queryFn: () => api<Paginated<PatientLinkView>>(`/admin/patient-links?${params.toString()}`),
  });

  const revoke = useMutation({
    mutationFn: (id: string) =>
      api<PatientLinkView>(`/admin/patient-links/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => {
      notify('Link revogado.');
      void client.invalidateQueries({ queryKey: ['patient-links'] });
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  return (
    <>
      <PageHeader
        title="Links personalizados"
        description="Links seguros para um paciente enviar a receita a uma loja, sem informar CPF."
        actions={
          <Link
            href="/admin/links/novo"
            className="inline-flex min-h-11 items-center gap-2 rounded-button bg-primary px-4 text-button font-semibold text-on-primary hover:bg-primary-hover"
          >
            <Link2 className="size-4" aria-hidden />
            Gerar link
          </Link>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <SelectField
          label="Loja"
          value={storeId}
          onChange={(e) => {
            setStoreId(e.target.value);
            setPage(1);
          }}
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
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos</option>
          {Object.values(PatientUploadLinkStatus).map((value) => (
            <option key={value} value={value}>
              {LINK_STATUS_LABELS[value]}
            </option>
          ))}
        </SelectField>
      </div>
      {query.isLoading ? <Spinner /> : null}
      {query.error ? <Alert tone="error" title={errorMessage(query.error)} /> : null}
      {query.data && query.data.items.length === 0 ? (
        <EmptyState title="Nenhum link encontrado">
          Gere um link para enviar a um paciente.
        </EmptyState>
      ) : null}
      {query.data && query.data.items.length > 0 ? (
        <>
          <Table caption="Links personalizados">
            <thead>
              <tr>
                <Th>Paciente</Th>
                <Th>Loja</Th>
                <Th>Gerado por</Th>
                <Th>Criado em</Th>
                <Th>Expira em</Th>
                <Th>Status</Th>
                <Th>Utilizado em</Th>
                <Th>
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((link) => (
                <tr key={link.id}>
                  <Td className="font-medium">{link.patientLabel}</Td>
                  <Td>{storeLabel(link.store)}</Td>
                  <Td className="text-content-secondary">{link.createdBy.name}</Td>
                  <Td className="whitespace-nowrap">{formatDateTime(link.createdAt)}</Td>
                  <Td className="whitespace-nowrap">{formatDateTime(link.expiresAt)}</Td>
                  <Td>
                    <LinkStatusBadge status={link.status} />
                  </Td>
                  <Td className="whitespace-nowrap">{formatDateTime(link.usedAt)}</Td>
                  <Td>
                    {link.status === 'ACTIVE' ? (
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="tertiary"
                            size="sm"
                            aria-label={`Revogar link de ${link.patientLabel}`}
                          >
                            Revogar
                          </Button>
                        }
                        title="Revogar link?"
                        description="O paciente não poderá mais usar este link para enviar a receita. Se necessário, gere um novo link."
                        confirmLabel="Revogar link"
                        loading={revoke.isPending}
                        onConfirm={() => revoke.mutate(link.id)}
                      />
                    ) : null}
                  </Td>
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
