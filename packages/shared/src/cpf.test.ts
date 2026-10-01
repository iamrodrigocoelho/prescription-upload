import { describe, expect, it } from 'vitest';
import { formatCpf, isValidCpf, maskCpf, normalizeCpf } from './cpf.js';

describe('isValidCpf', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35', ' 111.444.777-35 '])(
    'aceita CPF válido %s',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(true);
    },
  );

  it.each([
    ['dígito verificador errado', '529.982.247-24'],
    ['segundo dígito errado', '111.444.777-36'],
    ['curto', '1234567890'],
    ['longo', '529982247250'],
    ['vazio', ''],
    ['sequência repetida', '000.000.000-00'],
    ['sequência repetida 9', '99999999999'],
    ['letras', '529.982.247-2a'],
    ['caracteres estranhos', '529/982/247-25'],
  ])('rejeita CPF %s', (_label, cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });
});

describe('normalizeCpf / formatCpf', () => {
  it('remove a máscara', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
  });

  it('formata progressivamente', () => {
    expect(formatCpf('529')).toBe('529');
    expect(formatCpf('5299')).toBe('529.9');
    expect(formatCpf('5299822')).toBe('529.982.2');
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
    expect(formatCpf('5299822472599')).toBe('529.982.247-25');
  });
});

describe('maskCpf', () => {
  it('expõe somente os 2 últimos dígitos', () => {
    expect(maskCpf('529.982.247-25')).toBe('***.***.***-25');
    expect(maskCpf('52998224725')).toBe('***.***.***-25');
  });

  it('nunca contém os 9 primeiros dígitos', () => {
    const masked = maskCpf('52998224725');
    expect(masked).not.toMatch(/5299/);
    expect(masked.replace(/\D/g, '')).toBe('25');
  });

  it('mascara totalmente entradas inválidas', () => {
    expect(maskCpf('123')).toBe('***.***.***-**');
    expect(maskCpf(null)).toBe('***.***.***-**');
    expect(maskCpf(undefined)).toBe('***.***.***-**');
  });
});
