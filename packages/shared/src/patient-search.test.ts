import { describe, expect, it } from 'vitest';
import { normalizePhone, patientSearchSchema as base } from './schemas/patients.js';

const context = { storeId: '0b8f5f8e-3b44-4d6f-9a3f-2f5d9b9d1c11' };
const patientSearchSchema = {
  parse: (input: object) => base.parse({ ...input, context }),
  safeParse: (input: object) => base.safeParse({ ...input, context }),
};

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

  it('exige exatamente um contexto válido (receita ou loja)', () => {
    const query = { type: 'email', query: 'a@example.com' };
    expect(base.safeParse(query).success).toBe(false);
    expect(
      base.safeParse({
        ...query,
        context: { storeId: context.storeId, prescriptionId: context.storeId },
      }).success,
    ).toBe(false);
    expect(base.safeParse({ ...query, context: { prescriptionId: 'x' } }).success).toBe(false);
    expect(base.safeParse({ ...query, context: { prescriptionId: context.storeId } }).success).toBe(
      true,
    );
  });

  it('recusa campos extras (ex.: externalId enviado pelo cliente)', () => {
    expect(
      base.safeParse({ type: 'cpf', query: '529.982.247-25', context, externalId: 'x' }).success,
    ).toBe(false);
  });
});
