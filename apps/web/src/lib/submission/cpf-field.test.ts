import { describe, expect, it } from 'vitest';
import { cpfFieldState } from './cpf-field';

describe('cpfFieldState', () => {
  it('aplica a máscara enquanto digita, sem erro antes da interação', () => {
    expect(cpfFieldState('5299822', false)).toEqual({ value: '529.982.2', valid: false });
  });

  it('valida ao completar 11 dígitos', () => {
    expect(cpfFieldState('52998224725', false)).toEqual({ value: '529.982.247-25', valid: true });
    expect(cpfFieldState('52998224724', false)).toMatchObject({
      valid: false,
      error: 'CPF inválido.',
    });
  });

  it('após sair do campo incompleto, exibe erro', () => {
    expect(cpfFieldState('5299', true)).toMatchObject({ error: 'CPF inválido.' });
  });

  it('vazio é válido para envio (campo opcional) e sem erro', () => {
    expect(cpfFieldState('', true)).toEqual({ value: '', valid: false });
  });

  it('ignora letras e limita a 11 dígitos', () => {
    expect(cpfFieldState('529a982b24725999', false).value).toBe('529.982.247-25');
  });
});
