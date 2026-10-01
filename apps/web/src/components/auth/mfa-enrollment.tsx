'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { safeNextPath } from '@/lib/safe-next';
import { useClearSession } from '@/lib/session';
import { TotpSetup } from './totp-setup';

export function MfaEnrollment() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const clearSession = useClearSession();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h2 font-semibold">Configure a verificação em duas etapas</h1>
      <p className="text-body-sm text-content-secondary">
        O administrador exige a verificação em duas etapas para a sua conta. Conclua a configuração
        para continuar.
      </p>
      <TotpSetup
        doneLabel="Continuar para o painel"
        onCompleted={() => {
          clearSession();
          router.replace(next);
        }}
      />
    </div>
  );
}
