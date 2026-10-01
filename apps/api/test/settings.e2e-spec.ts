import type { INestApplication } from '@nestjs/common';
import { AuditAction } from '@receita/shared';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { createTestApp } from './utils/app.js';
import { resetDatabase } from './utils/db.js';

describe('SystemSetting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let settings: SettingsService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    settings = app.get(SettingsService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('possui valores iniciais da migration', async () => {
    await expect(settings.getAll()).resolves.toEqual({
      retention_days: 365,
      patient_link_default_expiry_days: 7,
      patient_link_max_expiry_days: 30,
    });
  });

  it('rejeita retenção abaixo de 365 dias no serviço', async () => {
    await expect(settings.update({ retention_days: 364 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect((await settings.getAll()).retention_days).toBe(365);
  });

  it('rejeita retenção abaixo de 365 dias também no banco (CHECK)', async () => {
    await expect(
      prisma.$executeRaw`UPDATE "system_settings" SET "value" = '364'::jsonb WHERE "key" = 'retention_days'`,
    ).rejects.toThrow(/system_settings_retention_min_chk/);
  });

  it('rejeita validade padrão maior que a máxima', async () => {
    await expect(settings.update({ patient_link_default_expiry_days: 31 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('atualiza valores válidos e audita a alteração', async () => {
    const before = new Date();
    await settings.update({ retention_days: 730 });
    expect((await settings.getAll()).retention_days).toBe(730);
    const event = await prisma.auditLog.findFirst({
      where: { action: AuditAction.SETTINGS_UPDATED, createdAt: { gte: before } },
      orderBy: { createdAt: 'desc' },
    });
    expect(event?.metadata).toEqual({ changes: { retention_days: { from: 365, to: 730 } } });
  });
});
