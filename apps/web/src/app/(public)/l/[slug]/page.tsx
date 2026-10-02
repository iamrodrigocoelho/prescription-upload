import type { Metadata } from 'next';
import { StoreLinkEntry } from '@/components/public/store-link-entry';
import { publicPageProps } from '@/lib/public-page';

export const metadata: Metadata = { title: 'Envio de receita' };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StoreLinkEntry slug={slug} {...await publicPageProps()} />;
}
