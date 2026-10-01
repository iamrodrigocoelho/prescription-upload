import { Injectable } from '@nestjs/common';
import { ApiErrorCode } from '@receita/shared';
import { AppError } from '../../common/errors.js';
import { type Patient, PatientProvider } from './patient.provider.js';

const unavailable = (): Promise<never> =>
  Promise.reject(
    new AppError(
      ApiErrorCode.SERVICE_UNAVAILABLE,
      'A consulta de pacientes está temporariamente indisponível.',
    ),
  );

/** Usado enquanto a API real não existe (PATIENT_PROVIDER=none): indisponibilidade explícita (PRD §33). */
@Injectable()
export class UnavailablePatientProvider extends PatientProvider {
  findByCpf(): Promise<Patient | null> {
    return unavailable();
  }
  searchByCpf(): Promise<Patient[]> {
    return unavailable();
  }
  searchByPhone(): Promise<Patient[]> {
    return unavailable();
  }
  searchByEmail(): Promise<Patient[]> {
    return unavailable();
  }
  findByExternalId(): Promise<Patient | null> {
    return unavailable();
  }
}
