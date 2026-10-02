import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { MetricsModule } from './infra/metrics/metrics.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { AttachmentProcessorService } from './modules/attachments/attachment-processor.service.js';
import { AuditService } from './modules/audit/audit.service.js';
import { MalwareModule } from './modules/malware/malware.module.js';

/** CLI isolada: não inicia consumidor BullMQ nem dispatcher. */
@Module({
  imports: [ConfigModule, PrismaModule, StorageModule, MetricsModule, MalwareModule],
  providers: [AuditService, AttachmentProcessorService],
})
export class RescanModule {}
