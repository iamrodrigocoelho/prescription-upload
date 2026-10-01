import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { PatientLinkAccessService } from './patient-link-access.service.js';
import { PatientLinksController } from './patient-links.controller.js';
import { PatientLinksService } from './patient-links.service.js';

@Module({
  imports: [SettingsModule],
  controllers: [PatientLinksController],
  providers: [PatientLinksService, PatientLinkAccessService],
  exports: [PatientLinkAccessService],
})
export class PatientLinksModule {}
