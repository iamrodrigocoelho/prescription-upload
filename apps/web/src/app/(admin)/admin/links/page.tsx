import type { Metadata } from 'next';
import { LinksPage } from '@/components/admin/links-page';

export const metadata: Metadata = { title: 'Links personalizados' };

export default function Page() {
  return <LinksPage />;
}
