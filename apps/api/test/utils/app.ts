import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { MailProvider } from '../../src/infra/mail/mail.provider.js';
import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import { REDIS } from '../../src/infra/redis/redis.module.js';
import { CaptchaVerifier } from '../../src/modules/captcha/captcha.verifier.js';
import { resetDatabase } from './db.js';
import { FakeCaptchaVerifier } from './fake-captcha.js';
import { InMemoryMailProvider } from './in-memory-mail.js';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  mail: InMemoryMailProvider;
  captcha: FakeCaptchaVerifier;
  /** Limpa banco (exceto audit_logs), chaves de rate limit e e-mails capturados. */
  reset(): Promise<void>;
}

/** Sobe a aplicação completa, com os mesmos middlewares e headers de produção. */
export async function createTestApp(): Promise<INestApplication> {
  return (await createTestContext()).app;
}

export async function createTestContext(): Promise<TestContext> {
  const mail = new InMemoryMailProvider();
  const captcha = new FakeCaptchaVerifier();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailProvider)
    .useValue(mail)
    .overrideProvider(CaptchaVerifier)
    .useValue(captcha)
    .compile();
  const app = moduleRef.createNestApplication({ bodyParser: false, bufferLogs: true });
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const redis = app.get<Redis>(REDIS);

  return {
    app,
    prisma,
    mail,
    captcha,
    async reset() {
      await resetDatabase(prisma);
      const keys = await redis.keys(`${process.env.REDIS_KEY_PREFIX ?? 'rv-test:'}*`);
      if (keys.length > 0) await redis.del(...keys);
      mail.clear();
    },
  };
}
