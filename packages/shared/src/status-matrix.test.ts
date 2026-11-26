import { describe, expect, it } from 'vitest';
import { OperationalStatus, Role, StatusReason } from './enums.js';
import { updatePrescriptionStatusSchema } from './schemas/prescriptions.js';
import {
  allowedTransitions,
  canTransition,
  isFinalStatus,
  isReopen,
  requiresReason,
  STATUS_REASON_LABELS,
} from './status-matrix.js';

const ALL = Object.values(OperationalStatus);
const C = Role.STORE_COLLABORATOR;

describe('matriz de transições', () => {
  it('fluxo principal Recebida → Em análise → Aprovada → Em atendimento → Finalizada', () => {
    expect(canTransition('RECEIVED', 'IN_REVIEW', C)).toBe(true);
    expect(canTransition('IN_REVIEW', 'APPROVED', C)).toBe(true);
    expect(canTransition('APPROVED', 'IN_SERVICE', C)).toBe(true);
    expect(canTransition('IN_SERVICE', 'FINISHED', C)).toBe(true);
  });

  it('decisões (Aprovada, Reprovada, Reenvio solicitado) somente a partir de Em análise', () => {
    for (const to of ['APPROVED', 'REJECTED', 'RESUBMISSION_REQUESTED'] as const) {
      expect(canTransition('IN_REVIEW', to, C)).toBe(true);
      for (const from of ['RECEIVED', 'APPROVED', 'IN_SERVICE'] as const) {
        expect(canTransition(from, to, Role.ADMIN)).toBe(false);
      }
    }
  });

  it('atendimento somente após aprovação; retorno para Em análise permitido', () => {
    expect(canTransition('RECEIVED', 'IN_SERVICE', Role.ADMIN)).toBe(false);
    expect(canTransition('IN_REVIEW', 'IN_SERVICE', Role.ADMIN)).toBe(false);
    expect(canTransition('APPROVED', 'IN_REVIEW', C)).toBe(true);
    expect(canTransition('IN_SERVICE', 'IN_REVIEW', C)).toBe(true);
  });

  it('Cancelada e Não atendida a partir de qualquer estado não final', () => {
    for (const from of ['RECEIVED', 'IN_REVIEW', 'APPROVED', 'IN_SERVICE'] as const) {
      expect(canTransition(from, 'CANCELLED', C)).toBe(true);
      expect(canTransition(from, 'NOT_SERVED', C)).toBe(true);
    }
  });

  it('finalizar somente a partir de Em atendimento', () => {
    for (const from of ['RECEIVED', 'IN_REVIEW', 'APPROVED'] as const) {
      expect(canTransition(from, 'FINISHED', Role.ADMIN)).toBe(false);
    }
  });

  it('nunca volta para Recebida nem transiciona para o mesmo estado', () => {
    for (const from of ALL) {
      for (const role of Object.values(Role)) {
        expect(canTransition(from, 'RECEIVED', role)).toBe(false);
        expect(canTransition(from, from, role)).toBe(false);
      }
    }
  });

  it('estados finais: Colaborador não reabre; Gestor e Admin reabrem para Em análise', () => {
    const finals = [
      'REJECTED',
      'RESUBMISSION_REQUESTED',
      'FINISHED',
      'CANCELLED',
      'NOT_SERVED',
    ] as const;
    for (const from of finals) {
      expect(isFinalStatus(from)).toBe(true);
      expect(allowedTransitions(from, C)).toEqual([]);
      expect(allowedTransitions(from, Role.MANAGER)).toEqual(['IN_REVIEW']);
      expect(allowedTransitions(from, Role.ADMIN)).toEqual(['IN_REVIEW']);
      expect(isReopen(from, 'IN_REVIEW')).toBe(true);
      expect(canTransition(from, 'IN_SERVICE', Role.ADMIN)).toBe(false);
    }
    expect(isFinalStatus('APPROVED')).toBe(false);
  });

  it('motivos exigidos só para Reprovada e Reenvio solicitado; todos têm rótulo', () => {
    expect(ALL.filter(requiresReason)).toEqual(['REJECTED', 'RESUBMISSION_REQUESTED']);
    for (const reason of Object.values(StatusReason)) {
      expect(STATUS_REASON_LABELS[reason]).toBeTruthy();
    }
  });
});

describe('updatePrescriptionStatusSchema', () => {
  const parse = (body: object) => updatePrescriptionStatusSchema.safeParse({ version: 0, ...body });

  it('aceita transição simples sem motivos', () => {
    expect(parse({ toStatus: 'APPROVED' }).success).toBe(true);
  });

  it('recusa motivos em status que não os exige', () => {
    expect(parse({ toStatus: 'APPROVED', reasons: ['CRM_ILLEGIBLE'] }).success).toBe(false);
    expect(parse({ toStatus: 'IN_REVIEW', reasonNote: 'x' }).success).toBe(false);
  });

  it('exige ao menos um motivo para Reprovada e Reenvio solicitado', () => {
    expect(parse({ toStatus: 'REJECTED' }).success).toBe(false);
    expect(parse({ toStatus: 'RESUBMISSION_REQUESTED', reasons: [] }).success).toBe(false);
    expect(
      parse({ toStatus: 'REJECTED', reasons: ['ISSUE_DATE_EXPIRED', 'CRM_ILLEGIBLE'] }).success,
    ).toBe(true);
  });

  it('recusa motivo repetido ou desconhecido', () => {
    expect(
      parse({ toStatus: 'REJECTED', reasons: ['CRM_ILLEGIBLE', 'CRM_ILLEGIBLE'] }).success,
    ).toBe(false);
    expect(parse({ toStatus: 'REJECTED', reasons: ['QUALQUER'] }).success).toBe(false);
  });

  it('"Outros" exige descrição; descrição sem "Outros" é recusada', () => {
    expect(parse({ toStatus: 'REJECTED', reasons: ['OTHER'] }).success).toBe(false);
    expect(parse({ toStatus: 'REJECTED', reasons: ['OTHER'], reasonNote: '   ' }).success).toBe(
      false,
    );
    expect(
      parse({ toStatus: 'REJECTED', reasons: ['OTHER'], reasonNote: 'Receita rasurada' }).success,
    ).toBe(true);
    expect(
      parse({ toStatus: 'REJECTED', reasons: ['CRM_ILLEGIBLE'], reasonNote: 'texto' }).success,
    ).toBe(false);
  });

  it('limita a descrição a 200 caracteres e recusa CPF no texto', () => {
    const base = { toStatus: 'RESUBMISSION_REQUESTED', reasons: ['OTHER'] };
    expect(parse({ ...base, reasonNote: 'a'.repeat(200) }).success).toBe(true);
    expect(parse({ ...base, reasonNote: 'a'.repeat(201) }).success).toBe(false);
    expect(parse({ ...base, reasonNote: 'paciente 123.456.789-09' }).success).toBe(false);
    expect(parse({ ...base, reasonNote: 'paciente 12345678909' }).success).toBe(false);
  });
});
