'use client';

import type { LinkPatientResponse, PatientSearchResult } from '@receita/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { track } from '@/lib/analytics';
import { PatientSearch, patientSearchErrorMessage } from '../patients/patient-search';

interface LinkPatientDialogProps {
  prescriptionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após o vínculo confirmado pelo backend. */
  onLinked: () => void;
  /** Para onde o foco volta ao fechar (o diálogo é controlado, sem Trigger). */
  onCloseAutoFocus: (event: Event) => void;
}

/**
 * "Vincular paciente" (PRD §8.6, DESIGN §8.5): critério → busca → resultados
 * mascarados → seleção → confirmação explícita. O vínculo só é exibido como feito
 * após a resposta positiva do backend (PRD §33).
 */
export function LinkPatientDialog({
  prescriptionId,
  open,
  onOpenChange,
  onLinked,
  onCloseAutoFocus,
}: LinkPatientDialogProps) {
  const client = useQueryClient();
  const notify = useToast();
  const [selected, setSelected] = useState<PatientSearchResult | null>(null);
  const [searchKey, setSearchKey] = useState(0);

  const refreshPrescription = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['prescriptions', 'detail', prescriptionId] }),
      client.invalidateQueries({ queryKey: ['prescriptions', 'queue'] }),
      client.invalidateQueries({ queryKey: ['prescriptions', 'counters'] }),
    ]);

  const link = useMutation({
    mutationFn: (selectionRef: string) =>
      api<LinkPatientResponse>(`/prescriptions/${prescriptionId}/patient-link`, {
        method: 'POST',
        body: { selectionRef },
      }),
    onSuccess: async () => {
      track('patient_linked', {});
      notify('Paciente vinculado.');
      onLinked();
      await refreshPrescription();
      onOpenChange(false);
    },
    onError: (error) => {
      // Seleção expirada: é preciso buscar de novo.
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
        setSelected(null);
        setSearchKey((key) => key + 1);
      }
      // Outro usuário (ou a identificação automática) vinculou antes: recarrega o estado.
      if (error instanceof ApiError && error.code === 'CONFLICT') void refreshPrescription();
    },
  });

  const conflictError =
    link.error instanceof ApiError && link.error.code === 'CONFLICT' ? link.error : null;
  const conflict = conflictError !== null;

  function change(next: boolean) {
    if (!next) {
      link.reset();
      setSelected(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-content/40" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-modal bg-surface p-6 shadow-overlay"
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-h3 font-semibold text-content">
              Vincular paciente
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="inline-flex size-9 items-center justify-center rounded-button hover:bg-hover"
              >
                <X className="size-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          {conflictError ? (
            <Alert tone="warning" title={conflictError.message}>
              <p>O vínculo não foi feito. Os dados da receita foram atualizados.</p>
            </Alert>
          ) : (
            <PatientSearch
              key={searchKey}
              context={{ prescriptionId }}
              selectedRef={selected?.selectionRef ?? null}
              onSelect={(patient) => {
                link.reset();
                setSelected(patient);
              }}
              autoFocus
            />
          )}

          {link.error && !conflict ? (
            <Alert tone="error" title={patientSearchErrorMessage(link.error)} />
          ) : null}

          {selected && !conflict ? (
            <p className="rounded-card border border-line bg-subtle p-3 text-body-sm">
              Confirme o vínculo de <strong>{selected.displayName}</strong> (CPF{' '}
              {selected.cpfMasked}) a esta receita.
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{conflict ? 'Fechar' : 'Cancelar'}</Button>
            </Dialog.Close>
            {conflict ? null : (
              <Button
                disabled={!selected}
                loading={link.isPending}
                onClick={() => selected && link.mutate(selected.selectionRef)}
              >
                Confirmar vínculo
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
