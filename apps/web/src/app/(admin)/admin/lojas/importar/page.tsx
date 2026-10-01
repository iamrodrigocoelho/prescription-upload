import type { Metadata } from 'next';
import { StoreImport } from '@/components/admin/store-import';

export const metadata: Metadata = { title: 'Importar lojas' };

export default function Page() {
  return <StoreImport />;
}
