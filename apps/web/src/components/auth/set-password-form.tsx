'use client';

import { PASSWORD_DEFAULT_MIN_LENGTH, passwordPolicyIssues } from '@receita/shared';
import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { api, ApiError, errorMessage } from '@/lib/api';

/**
 * Definição/redefinição de senha. O token chega no fragmento da URL (#token=…),
 * que não é enviado ao servidor; é lido e removido da barra de endereço (D-025).
 */
export function SetPasswordForm({ mode }: { mode: 'reset' | 'invite' }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const match = /token=([A-Za-z0-9_-]{43})/.exec(window.location.hash);
    // Leitura única do fragmento ao montar (não há fonte reativa para sincronizar).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(match?.[1] ?? null);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const issues = passwordPolicyIssues(password);
    if (issues.length > 0) return setFieldError(issues[0]);
    if (password !== confirmation) return setFieldError('As senhas não conferem.');
    setFieldError(undefined);
    setSubmitting(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION_FAILED' && e.issues[0])
        setFieldError(e.issues[0].message);
      else if (e instanceof ApiError && e.code === 'INVALID_OR_EXPIRED_TOKEN') setToken(null);
      else setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === 'invite' ? 'Defina sua senha' : 'Crie uma nova senha';

  if (token === undefined) return null;
  if (token === null) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="error" title="Este link é inválido ou expirou">
          <p>
            {mode === 'invite'
              ? 'Peça ao administrador um novo convite.'
              : 'Solicite uma nova redefinição de senha.'}
          </p>
        </Alert>
        <Link
          href={mode === 'invite' ? '/login' : '/esqueci-senha'}
          className="text-body-sm text-link underline"
        >
          {mode === 'invite' ? 'Ir para o login' : 'Solicitar novo link'}
        </Link>
      </div>
    );
  }
  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title="Senha definida com sucesso">
          <p>Por segurança, todas as sessões anteriores foram encerradas.</p>
        </Alert>
        <Link href="/login" className="text-body-sm text-link underline">
          Entrar
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
      <h1 className="text-h2 font-semibold">{title}</h1>
      {error ? <Alert tone="error" title={error} /> : null}
      <TextField
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={`Use ao menos ${PASSWORD_DEFAULT_MIN_LENGTH} caracteres. Frases longas são mais seguras e fáceis de lembrar.`}
        error={fieldError}
      />
      <TextField
        label="Confirme a nova senha"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
      />
      <Button type="submit" loading={submitting}>
        Salvar senha
      </Button>
    </form>
  );
}
