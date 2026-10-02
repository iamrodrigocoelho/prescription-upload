'use client';

import type { CpfRevealResponse } from '@receita/shared';
import { Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';

const VISIBLE_SECONDS = 30;

/**
 * CPF mascarado com revelação sob demanda (D-056): cada revelação é auditada no
 * servidor; o valor fica visível por 30 s e não entra em cache.
 */
export function CpfReveal({ prescriptionId, masked }: { prescriptionId: string; masked: string }) {
  const notify = useToast();
  const [cpf, setCpf] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cpf) return;
    const timer = setTimeout(() => setCpf(null), VISIBLE_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [cpf]);

  async function reveal() {
    setLoading(true);
    try {
      const result = await api<CpfRevealResponse>(`/prescriptions/${prescriptionId}/cpf/reveal`, {
        method: 'POST',
      });
      setCpf(result.cpf);
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono" aria-live="polite">
        {cpf ?? masked}
      </span>
      {cpf ? (
        <span className="text-caption text-content-muted">
          Visível por {VISIBLE_SECONDS} segundos
        </span>
      ) : (
        <Button variant="tertiary" size="sm" loading={loading} onClick={() => void reveal()}>
          <Eye className="size-4" aria-hidden />
          Mostrar CPF
        </Button>
      )}
    </div>
  );
}
