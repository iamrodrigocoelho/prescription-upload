import { describe, expect, it } from 'vitest';
import type {
  PatientProvider,
  PatientSummary,
} from '../../src/modules/patients/patient.provider.js';

/** Dados de um ambiente onde o adapter roda (fictícios no mock, de homologação no HTTP). */
export interface PatientProviderFixtures {
  /** CPF com exatamente um paciente. */
  uniqueCpf: string;
  /** CPF válido sem paciente. */
  unknownCpf: string;
  /** Telefone compartilhado por dois ou mais pacientes. */
  sharedPhone: string;
  /** E-mail com ao menos um paciente. */
  knownEmail: string;
  unknownEmail: string;
}

const SUMMARY_KEYS = ['cpfMasked', 'displayName', 'emailMasked', 'externalId', 'phoneMasked'];

function expectMinimal(summary: PatientSummary): void {
  // Nenhum campo além do resumo mínimo (PRD §8.2).
  expect(Object.keys(summary).sort()).toEqual(SUMMARY_KEYS);
  expect(summary.externalId).toEqual(expect.any(String));
  expect(summary.externalId.length).toBeGreaterThan(0);
  // Nome abreviado: primeiro nome + inicial ("João S.").
  expect(summary.displayName).toMatch(/^\S+( \S\.)?$/u);
  expect(summary.cpfMasked).toMatch(/^\*{3}\.\*{3}\.\*{3}-\d{2}$/);
  if (summary.phoneMasked !== null) expect(summary.phoneMasked).toMatch(/^\*{5}-\d{4}$/);
  if (summary.emailMasked !== null) expect(summary.emailMasked).toContain('***');
  // Nenhuma sequência que pareça CPF ou telefone integral.
  expect(JSON.stringify(summary)).not.toMatch(/\d{8,}/);
}

/**
 * Suíte de contrato do PatientProvider: todo adapter (mock hoje, HTTP quando houver
 * contrato) deve passar por ela.
 */
export function describePatientProviderContract(
  name: string,
  create: () => PatientProvider,
  fixtures: PatientProviderFixtures,
): void {
  describe(`contrato PatientProvider — ${name}`, () => {
    it('searchByCpf devolve o paciente em formato mínimo e mascarado', async () => {
      const results = await create().searchByCpf(fixtures.uniqueCpf);
      expect(results).toHaveLength(1);
      expectMinimal(results[0]!);
    });

    it('busca sem resultado devolve lista vazia', async () => {
      const provider = create();
      await expect(provider.searchByCpf(fixtures.unknownCpf)).resolves.toEqual([]);
      await expect(provider.searchByEmail(fixtures.unknownEmail)).resolves.toEqual([]);
    });

    it('searchByPhone devolve todos os pacientes do telefone, distintos', async () => {
      const results = await create().searchByPhone(fixtures.sharedPhone);
      expect(results.length).toBeGreaterThanOrEqual(2);
      results.forEach(expectMinimal);
      expect(new Set(results.map((r) => r.externalId)).size).toBe(results.length);
    });

    it('searchByEmail devolve resultados mínimos', async () => {
      const results = await create().searchByEmail(fixtures.knownEmail);
      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach(expectMinimal);
    });

    it('findByCpf: correspondência inequívoca ou null', async () => {
      const provider = create();
      const found = await provider.findByCpf(fixtures.uniqueCpf);
      expect(found).not.toBeNull();
      expectMinimal(found!);
      await expect(provider.findByCpf(fixtures.unknownCpf)).resolves.toBeNull();
    });
  });
}
