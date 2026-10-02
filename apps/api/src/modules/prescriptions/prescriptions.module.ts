import { Module } from '@nestjs/common';
import { PrescriptionsController } from './prescriptions.controller.js';
import { PrescriptionFilesService } from './prescription-files.service.js';
import { PrescriptionPatientLinkService } from './prescription-patient-link.service.js';
import { PrescriptionsService } from './prescriptions.service.js';

@Module({
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService, PrescriptionFilesService, PrescriptionPatientLinkService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
