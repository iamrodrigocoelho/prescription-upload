import type { Metadata } from 'next';
import { UsersPage } from '@/components/admin/users-page';

export const metadata: Metadata = { title: 'Usuários' };

export default function Page() {
  return <UsersPage />;
}
