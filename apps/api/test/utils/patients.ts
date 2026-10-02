import { randomBytes } from 'node:crypto';
import type { PatientSearchContext } from '@receita/shared';
import type { RawPatient } from '../../src/modules/patients/patient-display.js';
import { MOCK_PATIENTS } from '../../src/modules/patients/mock-patient.provider.js';
import type { Client } from './http.js';

export const JOAO = MOCK_PATIENTS[0]!;
export const MARIA = MOCK_PATIENTS[1]!;

/** Referência bem formada, porém inexistente. */
export const unknownSelectionRef = (): string => randomBytes(32).toString('base64url');

/**
 * Busca o paciente pelo CPF no contexto e devolve a referência opaca do primeiro
 * resultado. Se a busca for recusada (ex.: loja fora do escopo), devolve uma
 * referência inexistente — para exercitar a validação do endpoint seguinte.
 */
export async function selectPatient(
  client: Client,
  context: PatientSearchContext,
  patient: RawPatient = JOAO,
): Promise<string> {
  const res = await client.post('/patients/search', { type: 'cpf', query: patient.cpf, context });
  const first = (res.body as { results?: { selectionRef: string }[] }).results?.[0];
  return first?.selectionRef ?? unknownSelectionRef();
}

/** Gera link personalizado pelo fluxo real: busca no contexto da loja → seleção. */
export function createPatientLink(
  client: Client,
  storeId: string,
  patient: RawPatient = JOAO,
  extra: object = {},
) {
  return {
    expect: async (status: number) => {
      const selectionRef = await selectPatient(client, { storeId }, patient);
      return client
        .post('/admin/patient-links', { storeId, selectionRef, ...extra })
        .expect(status);
    },
  };
}
