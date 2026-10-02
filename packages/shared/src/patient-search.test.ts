import { describe, expect, it } from 'vitest';
import { normalizePhone, patientSearchSchema } from './schemas/patients.js';

describe('normalização da busca de pacientes', () => {
  it('telefone: somente dígitos, sem DDI 55', () => {
    expect(normalizePhone('(21) 99000-0099')).toBe('21990000099');
    expect(normalizePhone('+55 21 99000-0099')).toBe('21990000099');
    expect(normalizePhone('2133334444')).toBe('2133334444');
  });

  it('rejeita telefone curto ou longo demais', () => {
    expect(patientSearchSchema.safeParse({ type: 'phone', query: '9900-0099' }).success).toBe(
      false,
    );
    expect(patientSearchSchema.safeParse({ type: 'phone', query: '1234567890123' }).success).toBe(
      false,
    );
  });

  it('CPF validado e normalizado para dígitos', () => {
    const parsed = patientSearchSchema.parse({ type: 'cpf', query: '529.982.247-25' });
    expect(parsed.query).toBe('52998224725');
    expect(patientSearchSchema.safeParse({ type: 'cpf', query: '111.111.111-11' }).success).toBe(
      false,
    );
  });

  it('e-mail em minúsculas e sem espaços', () => {
    const parsed = patientSearchSchema.parse({ type: 'email', query: '  Joao.Teste@Example.COM ' });
    expect(parsed.query).toBe('joao.teste@example.com');
  });
});
