import type { Metadata } from 'next';
import { AccountSecurity } from '@/components/admin/account-security';

export const metadata: Metadata = { title: 'Segurança da conta' };

export default function Page() {
  return <AccountSecurity />;
}
