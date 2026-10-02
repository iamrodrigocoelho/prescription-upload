import { Module } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
import { HttpPatientProvider } from './http-patient.provider.js';
import { MockPatientProvider } from './mock-patient.provider.js';
import { PatientProvider } from './patient.provider.js';
import { ResilientPatientProvider } from './resilient-patient.provider.js';
import { UnavailablePatientProvider } from './unavailable-patient.provider.js';

/**
 * `PatientProvider` configurado: adapter escolhido por ambiente e sempre envolvido
 * pelo decorator de resiliência. Usado pela API e pelo worker.
 */
export function createPatientProvider(env: Env, metrics?: MetricsService): PatientProvider {
  if (!env.PATIENT_INTEGRATION_ENABLED) return new UnavailablePatientProvider();
  // O mock é bloqueado em produção pela validação do ambiente (env.ts).
  const adapter =
    env.PATIENT_PROVIDER === 'mock'
      ? new MockPatientProvider()
      : new HttpPatientProvider({
          baseUrl: env.PATIENT_API_BASE_URL ?? '',
          token: env.PATIENT_API_TOKEN,
          timeoutMs: env.PATIENT_API_TIMEOUT_MS,
        });
  return new ResilientPatientProvider(
    adapter,
    {
      timeoutMs: env.PATIENT_API_TIMEOUT_MS,
      retries: env.PATIENT_API_RETRIES,
      breakerThreshold: env.PATIENT_API_BREAKER_THRESHOLD,
      halfOpenAfterMs: env.PATIENT_API_BREAKER_HALF_OPEN_MS,
    },
    metrics && {
      observe: (operation, outcome, seconds) =>
        metrics.patientProviderDuration.observe({ operation, outcome }, seconds),
      error: (operation, kind) => metrics.patientProviderErrors.inc({ operation, kind }),
      circuit: (state) => metrics.patientProviderCircuit.set(state),
    },
  );
}

@Module({
  providers: [
    {
      provide: PatientProvider,
      inject: [ENV, MetricsService],
      useFactory: createPatientProvider,
    },
  ],
  exports: [PatientProvider],
})
export class PatientIntegrationModule {}
