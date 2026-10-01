'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginResponse, loginSchema } from '@receita/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { api, ApiError, errorMessage } from '@/lib/api';
import { safeNextPath } from '@/lib/safe-next';
import { useClearSession } from '@/lib/session';

type LoginForm = z.input<typeof loginSchema>;

export function routeForStatus(status: LoginResponse['status'], next: string): string {
  if (status === 'MFA_REQUIRED') return `/login/verificacao?next=${encodeURIComponent(next)}`;
  if (status === 'MFA_ENROLLMENT_REQUIRED')
    return `/login/configurar-2fa?next=${encodeURIComponent(next)}`;
  return next;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const clearSession = useClearSession();
  const next = safeNextPath(params.get('next'));
  const [error, setError] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm, unknown, z.output<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await api<LoginResponse>('/auth/login', { method: 'POST', body: values });
      clearSession();
      router.replace(routeForStatus(result.status, next));
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'INVALID_CREDENTIALS'
          ? 'E-mail ou senha inválidos.'
          : errorMessage(e),
      );
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-h2 font-semibold">Acesso ao painel</h1>
      {error ? (
        <Alert ref={alertRef} tone="error" title={error}>
          <p>Após várias tentativas sem sucesso, o acesso é bloqueado temporariamente.</p>
        </Alert>
      ) : null}
      <TextField
        label="E-mail"
        type="email"
        autoComplete="username"
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="Senha"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" loading={isSubmitting}>
        Entrar
      </Button>
      <Link href="/esqueci-senha" className="self-center text-body-sm text-link underline">
        Esqueci minha senha
      </Link>
    </form>
  );
}
