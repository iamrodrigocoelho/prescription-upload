import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { DomainEventsModule } from './common/events/domain-events.js';
import { RequestContextMiddleware } from './common/context/request-context.middleware.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { buildLoggerParams } from './common/logging/logger.config.js';
import { ConfigModule, ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { CryptoModule } from './infra/crypto/crypto.module.js';
import { MailModule } from './infra/mail/mail.module.js';
import { HttpMetricsMiddleware } from './infra/metrics/http-metrics.middleware.js';
import { MetricsModule } from './infra/metrics/metrics.module.js';
import { RateLimitModule } from './infra/rate-limit/rate-limit.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CaptchaModule } from './modules/captcha/captcha.module.js';
import { MalwareModule } from './modules/malware/malware.module.js';
import { SubmissionsModule } from './modules/submissions/submissions.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { PatientLinksModule } from './modules/patient-links/patient-links.module.js';
import { PatientsModule } from './modules/patients/patients.module.js';
import { PublicModule } from './modules/public/public.module.js';
import { StoresModule } from './modules/stores/stores.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => buildLoggerParams(env),
    }),
    PrismaModule,
    CryptoModule,
    RedisModule,
    RateLimitModule,
    MailModule,
    StorageModule,
    MetricsModule,
    CaptchaModule,
    MalwareModule,
    DomainEventsModule,
    AuditModule,
    AuthModule,
    HealthModule,
    SettingsModule,
    UsersModule,
    StoresModule,
    PatientsModule,
    PatientLinksModule,
    PublicModule,
    SubmissionsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware, HttpMetricsMiddleware).forRoutes('*path');
  }
}
