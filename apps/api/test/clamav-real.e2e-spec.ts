import { AuditAction } from '@receita/shared';
import { ENV } from '../src/config/config.module.js';
import type { Env } from '../src/config/env.js';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { MetricsService } from '../src/infra/metrics/metrics.service.js';
import { generateStorageKey } from '../src/infra/storage/storage-key.js';
import { StorageProvider } from '../src/infra/storage/storage.provider.js';
import { AttachmentProcessorService } from '../src/modules/attachments/attachment-processor.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { ClamAvScanner } from '../src/modules/malware/clamav-scanner.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createSubmission } from './utils/factories.js';

const EICAR = Buffer.from(
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}' + '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
);

/** Ative com CLAMAV_REAL_TEST=1 e clamd + FreshClam prontos (docker compose up clamav). */
describe.runIf(process.env.CLAMAV_REAL_TEST === '1')('ClamAV real / EICAR', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('detecta EICAR, remove original e registra quarentena', async () => {
    await ctx.reset();
    const env = ctx.app.get<Env>(ENV);
    const scanner = new ClamAvScanner(env);
    await scanner.ping();
    expect(
      await scanner.scan({
        fileId: 'synthetic',
        mimeType: 'application/octet-stream',
        content: EICAR,
      }),
    ).toBe('INFECTED');
    const storage = ctx.app.get(StorageProvider);
    const store = await createStore(ctx.prisma);
    const key = generateStorageKey('test');
    await storage.putObject({ key, body: EICAR, contentType: 'application/octet-stream' });
    const submission = await createSubmission(ctx.prisma, ctx.app.get(CryptoService), {
      storeId: store.id,
      files: [{ storageKey: key, mimeType: 'application/pdf', malwareScanStatus: 'PENDING' }],
    });
    const processor = new AttachmentProcessorService(
      ctx.prisma,
      storage,
      scanner,
      ctx.app.get(MetricsService),
      ctx.app.get(AuditService),
      env,
    );
    await processor.processSubmission(submission.id);
    const file = await ctx.prisma.prescriptionFile.findFirstOrThrow({
      where: { submissionId: submission.id },
    });
    expect(file.malwareScanStatus).toBe('INFECTED');
    expect(file.processingStatus).toBe('DONE');
    expect(await storage.headObject(key)).toBeNull();
    expect(await storage.headObject(file.quarantineStorageKey!)).not.toBeNull();
    expect(
      await ctx.prisma.auditLog.count({
        where: { entityId: file.id, action: AuditAction.PRESCRIPTION_FILE_QUARANTINED },
      }),
    ).toBe(1);
  });
});
