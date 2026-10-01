import { Injectable } from '@nestjs/common';
import { type Patient, PatientProvider } from './patient.provider.js';

/** Completa 9 dígitos com os dígitos verificadores, gerando um CPF estruturalmente válido. */
function withCheckDigits(base: string): string {
  const digit = (digits: string, factor: number): number => {
    const sum = [...digits].reduce((acc, d, i) => acc + Number(d) * (factor - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const first = digit(base, 10);
  return `${base}${first}${digit(`${base}${first}`, 11)}`;
}

/**
 * Pacientes FICTÍCIOS para desenvolvimento e testes (PATIENT_PROVIDER=mock).
 * Proibido em produção (validado no boot). Nenhum dado real.
 */
export const MOCK_PATIENTS: readonly Patient[] = [
  {
    externalId: 'mock-pat-0001',
    name: 'João da Silva Teste',
    cpf: withCheckDigits('100000001'),
    phone: '21990000001',
    email: 'joao.teste@example.com',
  },
  {
    externalId: 'mock-pat-0002',
    name: 'Maria Aparecida Ficticia',
    cpf: withCheckDigits('100000002'),
    phone: '21990000002',
    email: 'maria.ficticia@example.com',
  },
  {
    externalId: 'mock-pat-0003',
    name: 'Ana Beatriz Exemplo',
    cpf: withCheckDigits('100000003'),
    phone: '21990000003',
    email: null,
  },
  {
    externalId: 'mock-pat-0004',
    name: 'Carlos Eduardo Demo',
    cpf: withCheckDigits('100000004'),
    phone: null,
    email: 'carlos.demo@example.com',
  },
  // Dois pacientes com o mesmo telefone: exercita a desambiguação.
  {
    externalId: 'mock-pat-0005',
    name: 'Pedro Henrique Familia',
    cpf: withCheckDigits('100000005'),
    phone: '21990000099',
    email: 'familia@example.com',
  },
  {
    externalId: 'mock-pat-0006',
    name: 'Paula Regina Familia',
    cpf: withCheckDigits('100000006'),
    phone: '21990000099',
    email: 'familia@example.com',
  },
];

@Injectable()
export class MockPatientProvider extends PatientProvider {
  findByCpf(cpf: string): Promise<Patient | null> {
    return Promise.resolve(MOCK_PATIENTS.find((p) => p.cpf === cpf) ?? null);
  }

  searchByCpf(cpf: string): Promise<Patient[]> {
    return Promise.resolve(MOCK_PATIENTS.filter((p) => p.cpf === cpf));
  }

  searchByPhone(phone: string): Promise<Patient[]> {
    // Aceita com ou sem DDI 55.
    const local = phone.replace(/^55(?=\d{10,11}$)/, '');
    return Promise.resolve(MOCK_PATIENTS.filter((p) => p.phone === local));
  }

  searchByEmail(email: string): Promise<Patient[]> {
    return Promise.resolve(MOCK_PATIENTS.filter((p) => p.email === email));
  }

  findByExternalId(externalId: string): Promise<Patient | null> {
    return Promise.resolve(MOCK_PATIENTS.find((p) => p.externalId === externalId) ?? null);
  }
}
