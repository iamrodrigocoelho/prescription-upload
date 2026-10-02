import type { Metadata } from 'next';
import { PersonalizedEntry } from '@/components/public/personalized-entry';
import { publicPageProps } from '@/lib/public-page';

export const metadata: Metadata = { title: 'Envio de receita', referrer: 'no-referrer' };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PersonalizedEntry token={token} {...await publicPageProps()} />;
}
