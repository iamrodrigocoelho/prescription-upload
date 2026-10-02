import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { AuditService } from './modules/audit/audit.service.js';
import { RetentionService } from './modules/retention/retention.service.js';

/** CLI isolada: não inicia API, worker ou consumidores. */
@Module({
  imports: [ConfigModule, PrismaModule, StorageModule],
  providers: [AuditService, RetentionService],
})
export class RetentionCliModule {}
