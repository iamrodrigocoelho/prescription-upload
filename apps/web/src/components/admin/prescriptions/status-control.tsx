'use client';

import {
  isFinalStatus,
  OPERATIONAL_STATUS_LABELS,
  type OperationalStatus,
  type PrescriptionDetail,
} from '@receita/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SelectField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { track } from '@/lib/analytics';
import { OperationalBadge } from './badges';

/** Seletor só com as transições permitidas pela matriz (D-055); confirma estados finais. */
export function StatusControl({ detail }: { detail: PrescriptionDetail }) {
  const client = useQueryClient();
  const notify = useToast();
  const [target, setTarget] = useState<OperationalStatus | ''>('');

  const change = useMutation({
    mutationFn: (toStatus: OperationalStatus) =>
      api<{ operationalStatus: OperationalStatus; version: number }>(
        `/prescriptions/${detail.id}/status`,
        {
          method: 'PATCH',
          body: { toStatus, version: detail.version },
        },
      ),
    onSuccess: (result) => {
      notify(`Status alterado para ${OPERATIONAL_STATUS_LABELS[result.operationalStatus]}.`);
      track('prescription_status_changed', { status: result.operationalStatus });
      setTarget('');
      void client.invalidateQueries({ queryKey: ['prescriptions'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        notify(
          'Esta receita foi alterada por outro usuário. O estado atual foi recarregado.',
          'error',
        );
        void client.invalidateQueries({ queryKey: ['prescriptions', 'detail', detail.id] });
        setTarget('');
        return;
      }
      notify(errorMessage(error), 'error');
    },
  });

  const reopening = isFinalStatus(detail.operationalStatus);
  const needsConfirmation = target !== '' && (isFinalStatus(target) || reopening);
  const submitButton = (
    <Button
      disabled={target === ''}
      loading={change.isPending}
      onClick={needsConfirmation ? undefined : () => target && change.mutate(target)}
    >
      {reopening ? 'Reabrir' : 'Alterar status'}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-body-sm text-content-secondary">Status atual:</span>
        <OperationalBadge status={detail.operationalStatus} />
      </div>
      {detail.allowedTransitions.length === 0 ? (
        <p className="text-body-sm text-content-muted">
          {reopening
            ? 'Estado final. Somente gestores e administradores podem reabrir.'
            : 'Nenhuma alteração disponível.'}
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56">
            <SelectField
              label={reopening ? 'Reabrir como' : 'Novo status'}
              value={target}
              onChange={(e) => setTarget(e.target.value as OperationalStatus | '')}
            >
              <option value="">Selecione</option>
              {detail.allowedTransitions.map((status) => (
                <option key={status} value={status}>
                  {OPERATIONAL_STATUS_LABELS[status]}
                </option>
              ))}
            </SelectField>
          </div>
          {needsConfirmation ? (
            <ConfirmDialog
              trigger={submitButton}
              title={
                reopening
                  ? 'Reabrir receita?'
                  : `Marcar como ${OPERATIONAL_STATUS_LABELS[target as OperationalStatus]}?`
              }
              description={
                reopening
                  ? 'A receita voltará para "Em análise". A ação é registrada na auditoria.'
                  : 'Este é um estado final. Somente gestores e administradores poderão reabrir.'
              }
              confirmLabel={reopening ? 'Reabrir' : 'Confirmar'}
              destructive={false}
              loading={change.isPending}
              onConfirm={() => target && change.mutate(target)}
            />
          ) : (
            submitButton
          )}
        </div>
      )}
    </div>
  );
}
