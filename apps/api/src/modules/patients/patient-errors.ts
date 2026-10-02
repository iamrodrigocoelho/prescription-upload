import { ApiErrorCode } from '@receita/shared';
import { AppError } from '../../common/errors.js';
import { PatientProviderError } from './patient.provider.js';

export const PATIENTS_UNAVAILABLE_MESSAGE =
  'A consulta de pacientes está temporariamente indisponível. Tente novamente em instantes.';

/** Traduz erros da integração para a resposta HTTP padronizada (PRD §33). */
export function toAppError(error: unknown): unknown {
  if (!(error instanceof PatientProviderError)) return error;
  switch (error.kind) {
    case 'invalid':
      return new AppError(ApiErrorCode.VALIDATION_FAILED, 'Critério de busca inválido.');
    case 'not_found':
      return new AppError(ApiErrorCode.NOT_FOUND);
    default:
      return new AppError(ApiErrorCode.SERVICE_UNAVAILABLE, PATIENTS_UNAVAILABLE_MESSAGE);
  }
}

/** Executa uma chamada ao provider convertendo falhas de integração. */
export async function callProvider<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toAppError(error);
  }
}
