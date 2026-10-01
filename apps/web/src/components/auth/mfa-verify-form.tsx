'use client';

import type { TotpVerifyResponse } from '@receita/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { TextField } from '@/components/ui/field';
import { api, ApiError, errorMessage } from '@/lib/api';
import { safeNextPath } from '@/lib/safe-next';
import { useClearSession } from '@/lib/session';

export function MfaVerifyForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const clearSession = useClearSession();
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = useRecovery ? { recoveryCode: value } : { code: value };
      await api<TotpVerifyResponse>('/auth/totp/verify', { method: 'POST', body });
      clearSession();
      router.replace(next);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'UNAUTHENTICATED' || e.code === 'RATE_LIMITED')) {
        setExpired(true);
      } else {
        setError(
          e instanceof ApiError && e.code === 'INVALID_MFA_CODE'
            ? 'Código inválido.'
            : errorMessage(e),
        );
      }
      setValue('');
    } finally {
      setSubmitting(false);
    }
  }

  if (expired) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="warning" title="Sessão de verificação encerrada">
          <p>Por segurança, entre novamente com e-mail e senha.</p>
        </Alert>
        <Link href="/login" className="text-body-sm text-link underline">
          Voltar ao login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
      <h1 className="text-h2 font-semibold">Verificação em duas etapas</h1>
      <p className="text-body-sm text-content-secondary">
        {useRecovery
          ? 'Informe um dos códigos de recuperação que você guardou ao ativar a verificação.'
          : 'Informe o código de 6 dígitos exibido no seu aplicativo autenticador.'}
      </p>
      {useRecovery ? (
        <TextField
          label="Código de recuperação"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error ?? undefined}
          className="font-mono uppercase"
        />
      ) : (
        <CodeInput
          label="Código de verificação"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
          error={error ?? undefined}
          autoFocus
        />
      )}
      <Button
        type="submit"
        loading={submitting}
        disabled={useRecovery ? value.length < 10 : value.length !== 6}
      >
        Verificar
      </Button>
      <Button
        variant="tertiary"
        onClick={() => {
          setUseRecovery(!useRecovery);
          setValue('');
          setError(null);
        }}
      >
        {useRecovery ? 'Usar o aplicativo autenticador' : 'Usar um código de recuperação'}
      </Button>
    </form>
  );
}
