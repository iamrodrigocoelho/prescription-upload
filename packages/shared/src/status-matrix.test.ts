import { describe, expect, it } from 'vitest';
import { OperationalStatus, Role } from './enums.js';
import { allowedTransitions, canTransition, isFinalStatus, isReopen } from './status-matrix.js';

const ALL = Object.values(OperationalStatus);

describe('matriz de transições', () => {
  it('fluxo principal Recebida → Em análise → Em atendimento → Finalizada', () => {
    expect(canTransition('RECEIVED', 'IN_REVIEW', Role.STORE_COLLABORATOR)).toBe(true);
    expect(canTransition('IN_REVIEW', 'IN_SERVICE', Role.STORE_COLLABORATOR)).toBe(true);
    expect(canTransition('IN_SERVICE', 'FINISHED', Role.STORE_COLLABORATOR)).toBe(true);
  });

  it('atalho Recebida → Em atendimento e retorno Em atendimento → Em análise', () => {
    expect(canTransition('RECEIVED', 'IN_SERVICE', Role.STORE_COLLABORATOR)).toBe(true);
    expect(canTransition('IN_SERVICE', 'IN_REVIEW', Role.STORE_COLLABORATOR)).toBe(true);
  });

  it('Cancelada e Não atendida a partir de qualquer estado não final', () => {
    for (const from of ['RECEIVED', 'IN_REVIEW', 'IN_SERVICE'] as const) {
      expect(canTransition(from, 'CANCELLED', Role.STORE_COLLABORATOR)).toBe(true);
      expect(canTransition(from, 'NOT_SERVED', Role.STORE_COLLABORATOR)).toBe(true);
    }
  });

  it('finalizar somente a partir de Em atendimento', () => {
    expect(canTransition('RECEIVED', 'FINISHED', Role.ADMIN)).toBe(false);
    expect(canTransition('IN_REVIEW', 'FINISHED', Role.ADMIN)).toBe(false);
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
    for (const from of ['FINISHED', 'CANCELLED', 'NOT_SERVED'] as const) {
      expect(isFinalStatus(from)).toBe(true);
      expect(allowedTransitions(from, Role.STORE_COLLABORATOR)).toEqual([]);
      expect(allowedTransitions(from, Role.MANAGER)).toEqual(['IN_REVIEW']);
      expect(allowedTransitions(from, Role.ADMIN)).toEqual(['IN_REVIEW']);
      expect(isReopen(from, 'IN_REVIEW')).toBe(true);
      expect(canTransition(from, 'IN_SERVICE', Role.ADMIN)).toBe(false);
    }
  });
});
