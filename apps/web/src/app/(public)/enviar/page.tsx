import type { Metadata } from 'next';
import { GenericEntry } from '@/components/public/generic-entry';
import { publicPageProps } from '@/lib/public-page';

export const metadata: Metadata = { title: 'Envio de receita' };

export default async function Page() {
  return <GenericEntry {...await publicPageProps()} />;
}
