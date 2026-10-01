'use client';

import type { AdminUserView } from '@receita/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { UserForm } from './user-form';
import { TotpBadge, UserStatusBadge } from './users-page';

export function UserDetail({ id }: { id: string }) {
  const notify = useToast();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['user', id],
    queryFn: () => api<AdminUserView>(`/admin/users/${id}`),
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ['user', id] });

  const revoke = useMutation({
    mutationFn: () =>
      api<{ revoked: number }>(`/admin/users/${id}/sessions/revoke`, { method: 'POST' }),
    onSuccess: (result) => notify(`${result.revoked} sessão(ões) encerrada(s).`),
    onError: (error) => notify(errorMessage(error), 'error'),
  });
  const resetTotp = useMutation({
    mutationFn: () => api<AdminUserView>(`/admin/users/${id}/totp/reset`, { method: 'POST' }),
    onSuccess: () => {
      notify('Verificação em duas etapas redefinida.');
      refresh();
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });
  const resend = useMutation({
    mutationFn: () => api<{ inviteSent: boolean }>(`/admin/users/${id}/invite`, { method: 'POST' }),
    onSuccess: (result) =>
      notify(
        result.inviteSent ? 'Convite reenviado.' : 'Não foi possível enviar o convite.',
        result.inviteSent ? 'success' : 'error',
      ),
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  if (query.isLoading) return <Spinner />;
  if (query.error || !query.data) return <Alert tone="error" title={errorMessage(query.error)} />;
  const user = query.data;

  return (
    <>
      <PageHeader
        title={user.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {user.email} <UserStatusBadge user={user} /> <TotpBadge user={user} />
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <UserForm key={user.id + user.role + String(user.active)} user={user} />
        <Card className="flex flex-col gap-4 self-start">
          <h2 className="text-h3 font-semibold">Segurança</h2>
          <p className="text-body-sm text-content-secondary">
            Último acesso: {formatDateTime(user.lastLoginAt)}
          </p>
          <ConfirmDialog
            trigger={<Button variant="secondary">Encerrar todas as sessões</Button>}
            title="Encerrar sessões?"
            description="O usuário será desconectado de todos os dispositivos e precisará entrar novamente."
            confirmLabel="Encerrar sessões"
            loading={revoke.isPending}
            onConfirm={() => revoke.mutate()}
          />
          {user.totpEnabled ? (
            <ConfirmDialog
              trigger={<Button variant="secondary">Redefinir verificação em duas etapas</Button>}
              title="Redefinir a verificação em duas etapas?"
              description="Use quando o usuário perder o aplicativo autenticador. As sessões serão encerradas e, se o 2FA for obrigatório, ele configurará um novo autenticador no próximo acesso."
              confirmLabel="Redefinir"
              loading={resetTotp.isPending}
              onConfirm={() => resetTotp.mutate()}
            />
          ) : null}
          {user.pendingInvite && user.active ? (
            <Button variant="secondary" loading={resend.isPending} onClick={() => resend.mutate()}>
              Reenviar convite
            </Button>
          ) : null}
        </Card>
      </div>
    </>
  );
}
