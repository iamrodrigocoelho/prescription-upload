import { Module } from '@nestjs/common';
import { PatientLinksModule } from '../patient-links/patient-links.module.js';
import { PublicContextController } from './public-context.controller.js';
import { PublicContextService } from './public-context.service.js';

@Module({
  imports: [PatientLinksModule],
  controllers: [PublicContextController],
  providers: [PublicContextService],
})
export class PublicModule {}
