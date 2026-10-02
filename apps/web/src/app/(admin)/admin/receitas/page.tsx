import type { Metadata } from 'next';
import { Suspense } from 'react';
import { QueuePage } from '@/components/admin/prescriptions/queue-page';

export const metadata: Metadata = { title: 'Receitas' };

export default function Page() {
  return (
    <Suspense>
      <QueuePage />
    </Suspense>
  );
}
