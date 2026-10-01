'use client';

import type { AdminUserView, Paginated, Role } from '@receita/shared';
import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/card';
import { EmptyState, Spinner } from '@/components/ui/feedback';
import { SelectField, TextField } from '@/components/ui/field';
import { Pagination } from '@/components/ui/pagination';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/labels';

export function UserStatusBadge({ user }: { user: AdminUserView }) {
  if (!user.active) return <StatusBadge tone="neutral" label="Inativo" />;
  if (user.pendingInvite) return <StatusBadge tone="warning" label="Convite pendente" />;
  return <StatusBadge tone="success" label="Ativo" />;
}

export function TotpBadge({ user }: { user: AdminUserView }) {
  if (user.totpEnabled) return <StatusBadge tone="success" label="2FA ativo" />;
  if (user.totpRequired) return <StatusBadge tone="warning" label="2FA obrigatório, pendente" />;
  return <StatusBadge tone="neutral" label="2FA desativado" />;
}

export function UsersPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (search) params.set('search', search);
  if (role) params.set('role', role);

  const query = useQuery({
    queryKey: ['users', params.toString()],
    queryFn: () => api<Paginated<AdminUserView>>(`/admin/users?${params.toString()}`),
  });

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Perfis, escopo de lojas e segurança das contas internas."
        actions={
          <Link
            href="/admin/usuarios/novo"
            className="inline-flex min-h-11 items-center gap-2 rounded-button bg-primary px-4 text-button font-semibold text-on-primary hover:bg-primary-hover"
          >
            <UserPlus className="size-4" aria-hidden />
            Novo usuário
          </Link>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_240px]">
        <TextField
          label="Buscar"
          type="search"
          placeholder="Nome ou e-mail"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <SelectField
          label="Perfil"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos</option>
          {(Object.keys(ROLE_LABELS) as Role[]).map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </SelectField>
      </div>
      {query.isLoading ? <Spinner /> : null}
      {query.error ? <Alert tone="error" title={errorMessage(query.error)} /> : null}
      {query.data && query.data.items.length === 0 ? (
        <EmptyState title="Nenhum usuário encontrado" />
      ) : null}
      {query.data && query.data.items.length > 0 ? (
        <>
          <Table caption="Usuários">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Perfil</Th>
                <Th>Lojas</Th>
                <Th>Situação</Th>
                <Th>Segurança</Th>
                <Th>Último acesso</Th>
                <Th>
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((user) => (
                <tr key={user.id}>
                  <Td>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-caption text-content-muted">{user.email}</div>
                  </Td>
                  <Td>{ROLE_LABELS[user.role]}</Td>
                  <Td className="text-content-secondary">
                    {user.role === 'ADMIN'
                      ? 'Todas (global)'
                      : user.stores.map((store) => store.storeNumber).join(', ') || '—'}
                  </Td>
                  <Td>
                    <UserStatusBadge user={user} />
                  </Td>
                  <Td>
                    <TotpBadge user={user} />
                  </Td>
                  <Td className="whitespace-nowrap text-content-secondary">
                    {formatDateTime(user.lastLoginAt)}
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/usuarios/${user.id}`}
                      className="text-link underline"
                      aria-label={`Editar ${user.name}`}
                    >
                      Editar
                    </Link>
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
