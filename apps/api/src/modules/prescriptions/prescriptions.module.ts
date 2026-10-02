import { Module } from '@nestjs/common';
import { PrescriptionsController } from './prescriptions.controller.js';
import { PrescriptionFilesService } from './prescription-files.service.js';
import { PrescriptionsService } from './prescriptions.service.js';

@Module({
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService, PrescriptionFilesService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
