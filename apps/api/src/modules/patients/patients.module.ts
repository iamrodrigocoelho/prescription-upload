import { Global, Module } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { MockPatientProvider } from './mock-patient.provider.js';
import { PatientProvider } from './patient.provider.js';
import { PatientsController } from './patients.controller.js';
import { PatientsService } from './patients.service.js';
import { UnavailablePatientProvider } from './unavailable-patient.provider.js';

@Global()
@Module({
  controllers: [PatientsController],
  providers: [
    PatientsService,
    {
      provide: PatientProvider,
      inject: [ENV],
      // O mock é bloqueado em produção pela validação do ambiente (env.ts).
      useFactory: (env: Env): PatientProvider =>
        env.PATIENT_PROVIDER === 'mock'
          ? new MockPatientProvider()
          : new UnavailablePatientProvider(),
    },
  ],
  exports: [PatientProvider],
})
export class PatientsModule {}
