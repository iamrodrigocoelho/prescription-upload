import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { Brand } from '@/components/brand/brand';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell brand={<Brand height={28} />}>{children}</AdminShell>;
}
