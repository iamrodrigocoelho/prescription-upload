import { describe, expect, it } from 'vitest';
import { maskEmail, maskName, maskPhone } from './mask.js';

describe('maskName', () => {
  it('mantém primeiro nome e inicial do último', () => {
    expect(maskName('João da Silva')).toBe('João S.');
    expect(maskName('  maria   aparecida  ')).toBe('maria A.');
  });
  it('nome único', () => {
    expect(maskName('Ana')).toBe('Ana');
  });
  it('vazio', () => {
    expect(maskName('')).toBe('—');
    expect(maskName(null)).toBe('—');
  });
});

describe('maskPhone', () => {
  it('expõe os 4 últimos dígitos', () => {
    expect(maskPhone('(21) 98765-4321')).toBe('*****-4321');
  });
  it('telefone curto é totalmente mascarado', () => {
    expect(maskPhone('123')).toBe('*****-****');
  });
});

describe('maskEmail', () => {
  it('mascara usuário e domínio', () => {
    expect(maskEmail('joao.silva@example.com')).toBe('j***@e***.com');
    expect(maskEmail('a@b.com.br')).toBe('a***@b***.br');
  });
  it('entradas inválidas', () => {
    expect(maskEmail('semarroba')).toBe('***');
    expect(maskEmail('x@localhost')).toBe('x***@***');
    expect(maskEmail(null)).toBe('***');
  });
});
