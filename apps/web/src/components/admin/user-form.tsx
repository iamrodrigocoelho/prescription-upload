'use client';

import { type AdminUserView, type Role, storeAssignmentIssue } from '@receita/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SelectField, TextField } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/labels';
import { StorePicker } from './store-picker';

interface FormState {
  name: string;
  email: string;
  role: Role;
  active: boolean;
  totpRequired: boolean;
  storeIds: string[];
}

/** Criação (convite) e edição de usuário pelo Admin (RF-026, RF-027). */
export function UserForm({ user }: { user?: AdminUserView }) {
  const router = useRouter();
  const notify = useToast();
  const client = useQueryClient();
  const isNew = !user;
  const [form, setForm] = useState<FormState>({
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'STORE_COLLABORATOR',
    active: user?.active ?? true,
    totpRequired: user?.totpRequired ?? false,
    storeIds: user?.stores.map((store) => store.id) ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => {
      const storeIds = form.role === 'ADMIN' ? [] : form.storeIds;
      if (isNew) {
        return api<AdminUserView & { inviteSent: boolean }>('/admin/users', {
          method: 'POST',
          body: {
            name: form.name,
            email: form.email,
            role: form.role,
            storeIds,
            totpRequired: form.totpRequired,
          },
        });
      }
      return api<AdminUserView>(`/admin/users/${user.id}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          role: form.role,
          active: form.active,
          totpRequired: form.totpRequired,
          storeIds,
        },
      });
    },
    onSuccess: (saved) => {
      void client.invalidateQueries({ queryKey: ['users'] });
      if (isNew) {
        const inviteSent = 'inviteSent' in saved && saved.inviteSent;
        notify(
          inviteSent
            ? `Convite enviado para ${saved.email}.`
            : 'Usuário criado, mas o convite não foi enviado.',
          inviteSent ? 'success' : 'error',
        );
        router.push(`/admin/usuarios/${saved.id}`);
      } else {
        notify('Alterações salvas.');
        void client.invalidateQueries({ queryKey: ['user', saved.id] });
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.issues.length > 0) {
        setErrors(Object.fromEntries(error.issues.map((issue) => [issue.path, issue.message])));
      }
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Informe o nome.';
    if (isNew && !/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'E-mail inválido.';
    const storeIssue = storeAssignmentIssue(
      form.role,
      form.role === 'ADMIN' ? 0 : form.storeIds.length,
    );
    if (storeIssue) next.storeIds = storeIssue;
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {save.error && !(save.error instanceof ApiError && save.error.issues.length > 0) ? (
          <Alert tone="error" title={errorMessage(save.error)} />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Nome"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={errors.name}
          />
          <TextField
            label="E-mail"
            type="email"
            required={isNew}
            disabled={!isNew}
            hint={
              isNew ? 'O convite para definir a senha será enviado para este e-mail.' : undefined
            }
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={errors.email}
          />
          <SelectField
            label="Perfil"
            value={form.role}
            onChange={(e) => {
              const role = e.target.value as Role;
              setForm({ ...form, role, totpRequired: role === 'ADMIN' ? true : form.totpRequired });
            }}
            error={errors.role}
          >
            {(Object.keys(ROLE_LABELS) as Role[]).map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </SelectField>
        </div>
        <Switch
          label="Exigir verificação em duas etapas"
          description="No próximo acesso, o usuário deverá configurar um aplicativo autenticador."
          checked={form.totpRequired}
          onCheckedChange={(totpRequired) => setForm({ ...form, totpRequired })}
        />
        {!isNew ? (
          <Switch
            label="Usuário ativo"
            description="Desativar encerra imediatamente todas as sessões do usuário."
            checked={form.active}
            onCheckedChange={(active) => setForm({ ...form, active })}
          />
        ) : null}
        {form.role === 'ADMIN' ? (
          <Alert tone="info">
            <p>Administradores têm acesso a todas as lojas.</p>
          </Alert>
        ) : (
          <StorePicker
            value={form.storeIds}
            onChange={(storeIds) => setForm({ ...form, storeIds })}
            error={errors.storeIds}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={save.isPending}>
            {isNew ? 'Criar e enviar convite' : 'Salvar alterações'}
          </Button>
          <Button variant="secondary" onClick={() => router.push('/admin/usuarios')}>
            Voltar
          </Button>
        </div>
      </form>
    </Card>
  );
}
