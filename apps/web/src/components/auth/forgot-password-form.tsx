'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '@receita/shared';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof forgotPasswordSchema>, unknown, z.output<typeof forgotPasswordSchema>>(
    {
      resolver: zodResolver(forgotPasswordSchema),
    },
  );

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: values });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title="Solicitação recebida">
          <p>
            Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha em
            instantes.
          </p>
        </Alert>
        <Link href="/login" className="text-body-sm text-link underline">
          Voltar ao login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-h2 font-semibold">Redefinir senha</h1>
      <p className="text-body-sm text-content-secondary">
        Informe o e-mail usado para acessar o painel.
      </p>
      {error ? <Alert tone="error" title={error} /> : null}
      <TextField
        label="E-mail"
        type="email"
        autoComplete="username"
        error={errors.email?.message}
        {...register('email')}
      />
      <Button type="submit" loading={isSubmitting}>
        Enviar instruções
      </Button>
      <Link href="/login" className="self-center text-body-sm text-link underline">
        Voltar ao login
      </Link>
    </form>
  );
}
