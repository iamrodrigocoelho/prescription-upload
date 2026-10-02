import type { DefaultJobOptions } from 'bullmq';
import type { Env } from '../../config/env.js';

export const PATIENT_IDENTIFICATION_QUEUE = 'patient-identification';
export const IDENTIFY_PATIENT_JOB = 'identify-patient';

export interface IdentifyPatientJob {
  submissionId: string;
}

/**
 * Retry com backoff exponencial (D-072): com os padrões (6 tentativas, 30 s) a
 * última tentativa ocorre ~16 min após a primeira (≈ 30 min no pior caso com o
 * circuit breaker aberto). Concluídos ficam 24 h para deduplicar.
 */
export function identificationJobOptions(
  env: Pick<Env, 'PATIENT_AUTO_IDENTIFICATION_ATTEMPTS' | 'PATIENT_AUTO_IDENTIFICATION_BACKOFF_MS'>,
): DefaultJobOptions {
  return {
    attempts: env.PATIENT_AUTO_IDENTIFICATION_ATTEMPTS,
    backoff: { type: 'exponential', delay: env.PATIENT_AUTO_IDENTIFICATION_BACKOFF_MS },
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { age: 7 * 24 * 3600 },
  };
}

/** Um job por receita (idempotência); BullMQ não aceita ':' em jobId. */
export function identificationJobId(submissionId: string): string {
  return `identify-${submissionId}`;
}
