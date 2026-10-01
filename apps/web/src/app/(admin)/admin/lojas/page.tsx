import type { Metadata } from 'next';
import { StoresPage } from '@/components/admin/stores-page';

export const metadata: Metadata = { title: 'Lojas' };

export default function Page() {
  return <StoresPage />;
}
