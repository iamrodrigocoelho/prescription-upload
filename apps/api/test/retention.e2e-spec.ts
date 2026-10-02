import { AuditAction } from '@receita/shared';
import { vi } from 'vitest';
import { ENV } from '../src/config/config.module.js';
import type { Env } from '../src/config/env.js';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { generateStorageKey } from '../src/infra/storage/storage-key.js';
import { StorageProvider } from '../src/infra/storage/storage.provider.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { RetentionService } from '../src/modules/retention/retention.service.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createSubmission, createUser } from './utils/factories.js';
import { loginAs } from './utils/http.js';

describe('Retenção, descarte e legal hold', () => {
  let ctx: TestContext;
  let storage: StorageProvider;
  let crypto: CryptoService;
  let retention: RetentionService;

  beforeAll(async () => {
    ctx = await createTestContext();
    storage = ctx.app.get(StorageProvider);
    crypto = ctx.app.get(CryptoService);
    retention = ctx.app.get(RetentionService);
  });
  beforeEach(async () => ctx.reset());
  afterAll(async () => ctx.app.close());

  it('relatório é o padrão; legal hold só por Admin impede seleção e execução', async () => {
    const store = await createStore(ctx.prisma);
    const submission = await createSubmission(ctx.prisma, crypto, { storeId: store.id });
    await ctx.prisma.prescriptionSubmission.update({
      where: { id: submission.id },
      data: { retentionUntil: new Date(Date.now() - 86_400_000) },
    });
    expect(await retention.report()).toEqual([{ id: submission.id, fileCount: 1 }]);
    const collaborator = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { storeIds: [store.id] }),
    );
    await collaborator
      .patch(`/admin/retention/${submission.id}/legal-hold`, { enabled: true })
      .expect(403);
    const admin = await loginAs(ctx.app, () => createUser(ctx.prisma, crypto, { role: 'ADMIN' }));
    await admin
      .patch(`/admin/retention/${submission.id}/legal-hold`, { enabled: true })
      .expect(200);
    expect(await retention.report()).toEqual([]);
    await expect(retention.execute()).rejects.toThrow('aprovação');
    const approved = new RetentionService(ctx.prisma, storage, ctx.app.get(AuditService), {
      ...ctx.app.get<Env>(ENV),
      RETENTION_EXECUTION_ENABLED: true,
      RETENTION_APPROVAL_REFERENCE: 'DPO-TESTE-001',
      RETENTION_STORAGE_VERSIONING: 'disabled',
    });
    expect(await approved.execute()).toEqual({ disposed: [], failed: [] });
    await admin
      .patch(`/admin/retention/${submission.id}/legal-hold`, { enabled: false })
      .expect(200);
    expect(await retention.report()).toEqual([{ id: submission.id, fileCount: 1 }]);
    expect(
      await ctx.prisma.auditLog.count({
        where: { entityId: submission.id, action: AuditAction.PRESCRIPTION_LEGAL_HOLD_ENABLED },
      }),
    ).toBe(1);
  });

  it('execução aprovada apaga original, derivados, quarentena e identificadores', async () => {
    const store = await createStore(ctx.prisma);
    const key = generateStorageKey('test');
    const submission = await createSubmission(ctx.prisma, crypto, {
      storeId: store.id,
      cpf: '12345678909',
      patient: { externalId: 'PACIENTE-FICTICIO-1', label: 'Pessoa Fictícia' },
      files: [{ storageKey: key }],
    });
    const file = submission.files[0]!;
    const preview = `derivatives/${file.id}/preview.jpg`;
    const thumbnail = `derivatives/${file.id}/thumbnail.jpg`;
    const quarantine = `quarantine/${file.id}/original`;
    const keys = [key, preview, thumbnail, quarantine];
    for (const objectKey of keys) {
      await storage.putObject({
        key: objectKey,
        body: Buffer.from('arquivo sintetico'),
        contentType: 'image/jpeg',
      });
    }
    await ctx.prisma.prescriptionFile.update({
      where: { id: file.id },
      data: {
        previewStorageKey: preview,
        thumbnailStorageKey: thumbnail,
        quarantineStorageKey: quarantine,
      },
    });
    const { user } = await createUser(ctx.prisma, crypto, { role: 'ADMIN' });
    const link = await ctx.prisma.patientUploadLink.create({
      data: {
        storeId: store.id,
        createdByUserId: user.id,
        patientExternalId: 'PACIENTE-FICTICIO-1',
        patientDisplayLabel: 'Pessoa Fictícia',
        tokenHash: 'b'.repeat(64),
        status: 'USED',
        usedAt: new Date(Date.now() - 86_400_000),
        createdAt: new Date(Date.now() - 2 * 86_400_000),
        expiresAt: new Date(Date.now() - 86_400_000),
        usedSubmissionId: submission.id,
      },
    });
    await ctx.prisma.prescriptionSubmission.update({
      where: { id: submission.id },
      data: {
        retentionUntil: new Date(Date.now() - 86_400_000),
        patientUploadLinkId: link.id,
        idempotencyKey: 'c'.repeat(64),
      },
    });
    await ctx.prisma.patientLinkHistory.create({
      data: {
        submissionId: submission.id,
        patientExternalId: 'PACIENTE-FICTICIO-1',
        linkType: 'MANUAL',
        linkedByUserId: user.id,
      },
    });
    const approved = new RetentionService(ctx.prisma, storage, ctx.app.get(AuditService), {
      ...ctx.app.get<Env>(ENV),
      RETENTION_EXECUTION_ENABLED: true,
      RETENTION_APPROVAL_REFERENCE: 'DPO-TESTE-001',
      RETENTION_STORAGE_VERSIONING: 'disabled',
    });
    expect(await approved.execute()).toEqual({ disposed: [submission.id], failed: [] });
    for (const objectKey of keys) expect(await storage.headObject(objectKey)).toBeNull();
    const disposed = await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({
      where: { id: submission.id },
    });
    expect(disposed).toMatchObject({
      cpfEncrypted: null,
      cpfHashForLookup: null,
      patientExternalId: null,
      patientDisplayLabel: null,
      idempotencyKey: null,
    });
    expect(disposed.disposedAt).not.toBeNull();
    expect(
      await ctx.prisma.prescriptionFile.count({ where: { submissionId: submission.id } }),
    ).toBe(0);
    expect(
      await ctx.prisma.patientLinkHistory.count({ where: { submissionId: submission.id } }),
    ).toBe(0);
    expect(
      await ctx.prisma.patientUploadLink.findUniqueOrThrow({ where: { id: link.id } }),
    ).toMatchObject({
      patientExternalId: '[DISPOSED]',
      patientDisplayLabel: 'Dados descartados',
      status: 'REVOKED',
    });
    expect(
      await ctx.prisma.auditLog.count({
        where: { entityId: submission.id, action: AuditAction.PRESCRIPTION_DISPOSED },
      }),
    ).toBe(1);
    expect(await approved.report()).toEqual([]);
  });

  it('falha de storage fica auditada e pode ser retomada sem marcar descarte prematuro', async () => {
    const store = await createStore(ctx.prisma);
    const key = generateStorageKey('test');
    const submission = await createSubmission(ctx.prisma, crypto, {
      storeId: store.id,
      files: [{ storageKey: key }],
    });
    await storage.putObject({
      key,
      body: Buffer.from('arquivo sintetico'),
      contentType: 'image/jpeg',
    });
    await ctx.prisma.prescriptionSubmission.update({
      where: { id: submission.id },
      data: { retentionUntil: new Date(Date.now() - 86_400_000) },
    });
    const failingStorage = Object.create(storage) as StorageProvider;
    failingStorage.deleteObject = vi
      .fn()
      .mockRejectedValueOnce(new Error('falha sintetica'))
      .mockImplementation((objectKey: string) => storage.deleteObject(objectKey));
    const approved = new RetentionService(ctx.prisma, failingStorage, ctx.app.get(AuditService), {
      ...ctx.app.get<Env>(ENV),
      RETENTION_EXECUTION_ENABLED: true,
      RETENTION_APPROVAL_REFERENCE: 'DPO-TESTE-001',
      RETENTION_STORAGE_VERSIONING: 'disabled',
    });
    expect(await approved.execute()).toEqual({ disposed: [], failed: [submission.id] });
    expect(await storage.headObject(key)).not.toBeNull();
    expect(
      await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({ where: { id: submission.id } }),
    ).toMatchObject({ disposedAt: null });
    expect(
      await ctx.prisma.auditLog.count({
        where: { entityId: submission.id, action: AuditAction.PRESCRIPTION_DISPOSAL_FAILED },
      }),
    ).toBe(1);
    expect(await approved.execute(100, true, new Date(Date.now() + 11 * 60_000))).toEqual({
      disposed: [submission.id],
      failed: [],
    });
    expect(await storage.headObject(key)).toBeNull();
  });
});
