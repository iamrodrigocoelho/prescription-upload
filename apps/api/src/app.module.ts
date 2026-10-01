import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { RequestContextMiddleware } from './common/context/request-context.middleware.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { buildLoggerParams } from './common/logging/logger.config.js';
import { ConfigModule, ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { CryptoModule } from './infra/crypto/crypto.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => buildLoggerParams(env),
    }),
    PrismaModule,
    CryptoModule,
    AuditModule,
    HealthModule,
    SettingsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
