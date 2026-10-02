import type { Metadata } from 'next';
import { PersonalizedEntry } from '@/components/public/personalized-entry';
import { publicPageProps } from '@/lib/public-page';

export const metadata: Metadata = { title: 'Envio de receita', referrer: 'no-referrer' };

/** Destino após a troca do token por contexto em cookie (D-047). */
export default async function Page() {
  return <PersonalizedEntry {...await publicPageProps()} />;
}
