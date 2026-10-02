import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerParams } from './common/logging/logger.config.js';
import { ConfigModule, ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { CryptoModule } from './infra/crypto/crypto.module.js';
import { MetricsModule } from './infra/metrics/metrics.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { AttachmentProcessorService } from './modules/attachments/attachment-processor.service.js';
import { WorkerRunner } from './modules/attachments/worker-runner.service.js';
import { AuditService } from './modules/audit/audit.service.js';
import { MalwareModule } from './modules/malware/malware.module.js';
import { OutboxDispatcher } from './modules/outbox/outbox-dispatcher.service.js';
import { OutboxModule } from './modules/outbox/outbox.module.js';
import { PatientIdentificationService } from './modules/patient-identification/patient-identification.service.js';
import { PatientIntegrationModule } from './modules/patients/patient-integration.module.js';
import { RealtimePublisher } from './modules/realtime/realtime-publisher.js';

/** Processo worker: sem HTTP. */
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({ inject: [ENV], useFactory: (env: Env) => buildLoggerParams(env) }),
    PrismaModule,
    RedisModule,
    StorageModule,
    MetricsModule,
    CryptoModule,
    OutboxModule,
    MalwareModule,
    PatientIntegrationModule,
  ],
  providers: [
    AttachmentProcessorService,
    AuditService,
    OutboxDispatcher,
    PatientIdentificationService,
    RealtimePublisher,
    WorkerRunner,
  ],
})
export class WorkerModule {}
