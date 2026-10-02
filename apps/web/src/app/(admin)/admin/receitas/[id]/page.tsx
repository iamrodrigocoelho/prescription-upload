import type { Metadata } from 'next';
import { DetailPage } from '@/components/admin/prescriptions/detail-page';

export const metadata: Metadata = { title: 'Receita' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailPage id={id} />;
}
