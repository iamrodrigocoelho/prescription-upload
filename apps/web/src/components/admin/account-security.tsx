'use client';

import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { RecoveryCodes, TotpSetup } from '@/components/auth/totp-setup';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { CodeInput } from '@/components/ui/code-input';
import { TextField } from '@/components/ui/field';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { useRefreshSession, useSession } from '@/lib/session';

export function AccountSecurity() {
  const { me } = useSession();
  const refresh = useRefreshSession();
  const notify = useToast();
  const [setupOpen, setSetupOpen] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const regenerate = useMutation({
    mutationFn: () =>
      api<{ recoveryCodes: string[] }>('/auth/totp/recovery-codes', {
        method: 'POST',
        body: { code },
      }),
    onSuccess: (result) => {
      setNewCodes(result.recoveryCodes);
      setCode('');
    },
  });
  const disable = useMutation({
    mutationFn: () => api('/auth/totp/disable', { method: 'POST', body: { password, code } }),
    onSuccess: () => {
      notify('Verificação em duas etapas desativada.');
      setCode('');
      setPassword('');
      void refresh();
    },
  });

  if (!me) return null;
  const { totpEnabled, totpRequired } = me.user;

  return (
    <>
      <PageHeader title="Segurança da conta" />
      <Card className="flex max-w-2xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-h3 font-semibold">Verificação em duas etapas</h2>
          {totpEnabled ? (
            <StatusBadge tone="success" label="Ativa" />
          ) : (
            <StatusBadge tone="neutral" label="Desativada" />
          )}
        </div>
        <p className="text-body-sm text-content-secondary">
          Além da senha, exige um código do aplicativo autenticador (por exemplo, Google
          Authenticator) para entrar.
        </p>

        {!totpEnabled && !setupOpen ? (
          <Button className="self-start" onClick={() => setSetupOpen(true)}>
            Ativar
          </Button>
        ) : null}
        {!totpEnabled && setupOpen ? (
          <TotpSetup
            doneLabel="Concluir"
            onCompleted={() => {
              setSetupOpen(false);
              notify('Verificação em duas etapas ativada.');
              void refresh();
            }}
          />
        ) : null}

        {totpEnabled && newCodes ? (
          <RecoveryCodes codes={newCodes} doneLabel="Concluir" onDone={() => setNewCodes(null)} />
        ) : null}

        {totpEnabled && !newCodes ? (
          <form
            className="flex flex-col gap-4 border-t border-line pt-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              regenerate.mutate();
            }}
          >
            <h3 className="text-label font-semibold">Códigos de recuperação</h3>
            <p className="text-body-sm text-content-secondary">
              Gerar novos códigos invalida os anteriores. Informe um código do autenticador para
              confirmar.
            </p>
            <CodeInput
              label="Código do autenticador"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              error={regenerate.error ? errorMessage(regenerate.error) : undefined}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="secondary"
                disabled={code.length !== 6}
                loading={regenerate.isPending}
              >
                Gerar novos códigos
              </Button>
            </div>

            {totpRequired ? (
              <Alert tone="info">
                <p>
                  A verificação em duas etapas é obrigatória para a sua conta e não pode ser
                  desativada.
                </p>
              </Alert>
            ) : (
              <div className="flex flex-col gap-3 border-t border-line pt-4">
                <h3 className="text-label font-semibold">Desativar</h3>
                <TextField
                  label="Senha atual"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {disable.error ? <Alert tone="error" title={errorMessage(disable.error)} /> : null}
                <Button
                  variant="destructive"
                  className="self-start"
                  disabled={code.length !== 6 || !password}
                  loading={disable.isPending}
                  onClick={() => disable.mutate()}
                >
                  Desativar verificação em duas etapas
                </Button>
              </div>
            )}
          </form>
        ) : null}
      </Card>
    </>
  );
}
