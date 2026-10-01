import type { Metadata } from 'next';
import { LinkGenerator } from '@/components/admin/link-generator';

export const metadata: Metadata = { title: 'Gerar link' };

export default function Page() {
  return <LinkGenerator />;
}
