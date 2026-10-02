import { Global, Module } from '@nestjs/common';
import { PatientIntegrationModule } from './patient-integration.module.js';
import { PatientsController } from './patients.controller.js';
import { PatientsService } from './patients.service.js';

@Global()
@Module({
  imports: [PatientIntegrationModule],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientIntegrationModule],
})
export class PatientsModule {}
