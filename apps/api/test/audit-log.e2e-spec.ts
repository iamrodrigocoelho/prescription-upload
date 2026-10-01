import type { INestApplication } from '@nestjs/common';
import { AuditAction } from '@receita/shared';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { createTestApp } from './utils/app.js';

describe('AuditLog append-only (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let audit: AuditService;
  let eventId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    audit = app.get(AuditService);
    const entityId = crypto.randomUUID();
    await audit.record({
      action: AuditAction.STORE_UPDATED,
      entityType: 'Store',
      entityId,
      actor: { userId: null, role: null },
      metadata: { field: 'store_name', cpf: '52998224725', note: 'cliente 529.982.247-25' },
    });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId } });
    eventId = row.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('grava o evento com metadados sanitizados', async () => {
    const row = await prisma.auditLog.findUniqueOrThrow({ where: { id: eventId } });
    expect(row.result).toBe('SUCCESS');
    const serialized = JSON.stringify(row.metadata);
    expect(serialized).not.toContain('52998224725');
    expect(serialized).not.toContain('529.982.247-25');
    expect(row.metadata).toMatchObject({ field: 'store_name', cpf: '[REDACTED]' });
  });

  it('bloqueia UPDATE no banco', async () => {
    await expect(
      prisma.$executeRaw`UPDATE "audit_logs" SET "action" = 'adulterado' WHERE "id" = ${eventId}::uuid`,
    ).rejects.toThrow(/append-only/);
  });

  it('bloqueia DELETE no banco', async () => {
    await expect(
      prisma.$executeRaw`DELETE FROM "audit_logs" WHERE "id" = ${eventId}::uuid`,
    ).rejects.toThrow(/append-only/);
  });

  it('bloqueia TRUNCATE no banco', async () => {
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"')).rejects.toThrow(
      /append-only/,
    );
  });

  it('bloqueia alterações também via Prisma Client', async () => {
    await expect(
      prisma.auditLog.update({ where: { id: eventId }, data: { action: 'x' } }),
    ).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: eventId } })).rejects.toThrow();
    const row = await prisma.auditLog.findUniqueOrThrow({ where: { id: eventId } });
    expect(row.action).toBe(AuditAction.STORE_UPDATED);
  });

  it('AuditService não expõe métodos de alteração ou remoção', () => {
    const methods = Object.getOwnPropertyNames(AuditService.prototype);
    expect(methods.filter((name) => /update|delete|remove|edit/i.test(name))).toEqual([]);
  });
});
