import { Module } from '@nestjs/common';
import { PatientLinksModule } from '../patient-links/patient-links.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { IdempotencyService } from './idempotency.service.js';
import { StorageCleanupService } from './storage-cleanup.service.js';
import { SubmissionsController } from './submissions.controller.js';
import { SubmissionsService } from './submissions.service.js';

@Module({
  imports: [PatientLinksModule, SettingsModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, IdempotencyService, StorageCleanupService],
})
export class SubmissionsModule {}
