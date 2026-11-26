'use client';

import {
  isFinalStatus,
  OPERATIONAL_STATUS_LABELS,
  type OperationalStatus,
  type PrescriptionDetail,
  requiresReason,
  STATUS_REASON_LABELS,
  STATUS_REASON_NOTE_MAX,
  StatusReason,
} from '@receita/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SelectField, TextAreaField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { track } from '@/lib/analytics';
import { formatDateTime } from '@/lib/format';
import { OperationalBadge } from './badges';

const REASONS = Object.values(StatusReason);

/** Sequência com cara de CPF: o backend recusa; o aviso aqui evita a ida e volta. */
const CPF_LIKE = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;

interface ChangeInput {
  toStatus: OperationalStatus;
  reasons?: StatusReason[];
  reasonNote?: string;
}

/**
 * Seletor só com as transições permitidas pela matriz (D-055/D-087); confirma
 * estados finais. Reprovada e Reenvio solicitado exigem motivos (D-087).
 */
export function StatusControl({ detail }: { detail: PrescriptionDetail }) {
  const client = useQueryClient();
  const notify = useToast();
  const [target, setTarget] = useState<OperationalStatus | ''>('');
  const [reasons, setReasons] = useState<StatusReason[]>([]);
  const [note, setNote] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  function reset() {
    setTarget('');
    setReasons([]);
    setNote('');
    setShowErrors(false);
  }

  const change = useMutation({
    mutationFn: (input: ChangeInput) =>
      api<{ operationalStatus: OperationalStatus; version: number }>(
        `/prescriptions/${detail.id}/status`,
        { method: 'PATCH', body: { ...input, version: detail.version } },
      ),
    onSuccess: (result) => {
      notify(`Status alterado para ${OPERATIONAL_STATUS_LABELS[result.operationalStatus]}.`);
      // Analytics: só o status; motivos e texto livre ficam fora (allowlist).
      track('prescription_status_changed', { status: result.operationalStatus });
      reset();
      void client.invalidateQueries({ queryKey: ['prescriptions'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        notify(
          'Esta receita foi alterada por outro usuário. O estado atual foi recarregado.',
          'error',
        );
        void client.invalidateQueries({ queryKey: ['prescriptions', 'detail', detail.id] });
        reset();
        return;
      }
      notify(errorMessage(error), 'error');
    },
  });

  const reopening = isFinalStatus(detail.operationalStatus);
  const needsReason = target !== '' && requiresReason(target);
  const hasOther = reasons.includes(StatusReason.OTHER);
  const trimmedNote = note.trim();

  const reasonsError = needsReason && reasons.length === 0 ? 'Selecione ao menos um motivo.' : '';
  const noteError = !hasOther
    ? ''
    : trimmedNote === ''
      ? 'Descreva o motivo.'
      : CPF_LIKE.test(trimmedNote)
        ? 'Não inclua CPF ou outros dados pessoais na descrição.'
        : '';
  const valid = target !== '' && !reasonsError && !noteError;

  const payload = (): ChangeInput | null => {
    if (target === '') return null;
    if (!needsReason) return { toStatus: target };
    return {
      toStatus: target,
      reasons,
      ...(hasOther ? { reasonNote: trimmedNote } : {}),
    };
  };
  const submit = () => {
    const input = payload();
    if (input) change.mutate(input);
  };

  function toggleReason(reason: StatusReason, checked: boolean) {
    setReasons((current) =>
      checked
        ? REASONS.filter((r) => r === reason || current.includes(r))
        : current.filter((r) => r !== reason),
    );
    if (reason === StatusReason.OTHER && !checked) setNote('');
  }

  const needsConfirmation = target !== '' && (isFinalStatus(target) || reopening);
  const label = reopening ? 'Reabrir' : 'Alterar status';
  const submitButton = (
    <Button
      disabled={target === ''}
      loading={change.isPending}
      onClick={needsConfirmation ? undefined : submit}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-body-sm text-content-secondary">Status atual:</span>
        <OperationalBadge status={detail.operationalStatus} />
      </div>

      {detail.statusDecision ? (
        <div className="rounded-input border border-line bg-subtle p-3 text-body-sm">
          <p className="font-medium text-content">
            {detail.operationalStatus === 'REJECTED'
              ? 'Motivos da reprovação'
              : 'Motivos do reenvio'}
          </p>
          <ul className="mt-1 list-disc pl-5 text-content">
            {detail.statusDecision.reasons.map((reason) => (
              <li key={reason}>
                {STATUS_REASON_LABELS[reason]}
                {reason === StatusReason.OTHER && detail.statusDecision?.reasonNote
                  ? `: ${detail.statusDecision.reasonNote}`
                  : ''}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-caption text-content-muted">
            {detail.statusDecision.actorName ?? 'Sistema'} ·{' '}
            {formatDateTime(detail.statusDecision.decidedAt)}
          </p>
        </div>
      ) : null}

      {detail.allowedTransitions.length === 0 ? (
        <p className="text-body-sm text-content-muted">
          {reopening
            ? 'Estado final. Somente gestores e administradores podem reabrir.'
            : 'Nenhuma alteração disponível.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="min-w-56 sm:max-w-xs">
            <SelectField
              label={reopening ? 'Reabrir como' : 'Novo status'}
              value={target}
              onChange={(e) => {
                setTarget(e.target.value as OperationalStatus | '');
                setReasons([]);
                setNote('');
                setShowErrors(false);
              }}
            >
              <option value="">Selecione</option>
              {detail.allowedTransitions.map((status) => (
                <option key={status} value={status}>
                  {OPERATIONAL_STATUS_LABELS[status]}
                </option>
              ))}
            </SelectField>
          </div>

          {needsReason ? (
            <fieldset
              className="flex flex-col gap-1 rounded-input border border-line p-3"
              aria-describedby={showErrors && reasonsError ? 'status-reasons-error' : undefined}
            >
              <legend className="px-1 text-label font-medium text-content">
                {target === 'REJECTED' ? 'Motivo da reprovação' : 'Motivo do reenvio'}
                <span className="text-content-muted"> (marque um ou mais)</span>
              </legend>
              {REASONS.map((reason) => (
                <Checkbox
                  key={reason}
                  label={STATUS_REASON_LABELS[reason]}
                  checked={reasons.includes(reason)}
                  onCheckedChange={(checked) => toggleReason(reason, checked)}
                />
              ))}
              {showErrors && reasonsError ? (
                <p id="status-reasons-error" role="alert" className="text-caption text-error">
                  {reasonsError}
                </p>
              ) : null}
              {hasOther ? (
                <div className="mt-2">
                  <TextAreaField
                    label="Descreva o motivo"
                    required
                    maxLength={STATUS_REASON_NOTE_MAX}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    hint={`Até ${STATUS_REASON_NOTE_MAX} caracteres (${note.length}/${STATUS_REASON_NOTE_MAX}). Não inclua dados pessoais do paciente.`}
                    error={showErrors ? noteError || undefined : undefined}
                  />
                </div>
              ) : null}
            </fieldset>
          ) : null}

          <div>
            {needsConfirmation && valid ? (
              <ConfirmDialog
                trigger={submitButton}
                title={
                  reopening
                    ? 'Reabrir receita?'
                    : `Marcar como ${OPERATIONAL_STATUS_LABELS[target as OperationalStatus]}?`
                }
                description={
                  reopening ? (
                    'A receita voltará para "Em análise". A ação é registrada na auditoria.'
                  ) : (
                    <>
                      {needsReason ? (
                        <span className="mb-2 block">
                          Motivos:{' '}
                          {reasons.map((reason) => STATUS_REASON_LABELS[reason]).join('; ')}.
                        </span>
                      ) : null}
                      Este é um estado final. Somente gestores e administradores poderão reabrir.
                    </>
                  )
                }
                confirmLabel={reopening ? 'Reabrir' : 'Confirmar'}
                destructive={false}
                loading={change.isPending}
                onConfirm={submit}
              />
            ) : needsConfirmation ? (
              // Motivos incompletos: o clique mostra os erros em vez de abrir a confirmação.
              <Button onClick={() => setShowErrors(true)}>{label}</Button>
            ) : (
              submitButton
            )}
          </div>
        </div>
      )}
    </div>
  );
}
