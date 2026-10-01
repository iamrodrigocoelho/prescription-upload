import type { Metadata } from 'next';
import { UserForm } from '@/components/admin/user-form';
import { PageHeader } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Novo usuário' };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Novo usuário"
        description="O usuário define a própria senha pelo convite enviado por e-mail."
      />
      <UserForm />
    </>
  );
}
