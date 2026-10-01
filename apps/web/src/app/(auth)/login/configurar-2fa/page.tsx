import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MfaEnrollment } from '@/components/auth/mfa-enrollment';

export const metadata: Metadata = { title: 'Configurar verificação em duas etapas' };

export default function EnrollmentPage() {
  return (
    <Suspense>
      <MfaEnrollment />
    </Suspense>
  );
}
