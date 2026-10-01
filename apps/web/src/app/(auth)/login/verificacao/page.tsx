import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MfaVerifyForm } from '@/components/auth/mfa-verify-form';

export const metadata: Metadata = { title: 'Verificação em duas etapas' };

export default function VerifyPage() {
  return (
    <Suspense>
      <MfaVerifyForm />
    </Suspense>
  );
}
