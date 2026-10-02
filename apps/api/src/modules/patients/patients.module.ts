import { Global, Module } from '@nestjs/common';
import { PatientIntegrationModule } from './patient-integration.module.js';
import { PatientSelectionService } from './patient-selection.service.js';
import { PatientsController } from './patients.controller.js';
import { PatientsService } from './patients.service.js';

@Global()
@Module({
  imports: [PatientIntegrationModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientSelectionService],
  exports: [PatientIntegrationModule, PatientsService, PatientSelectionService],
})
export class PatientsModule {}
