import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadRootEnv } from './config/load-env.js';
import { PrismaService } from './infra/prisma/prisma.service.js';
import { AttachmentProcessorService } from './modules/attachments/attachment-processor.service.js';
import { RescanModule } from './rescan.module.js';

loadRootEnv();
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const all = args.has('--all');
const retryQuarantine = args.has('--retry-quarantine');
if (retryQuarantine && all) throw new Error('--all e --retry-quarantine são mutuamente exclusivos');
const limitArg = [...args].find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 1000;
if (!Number.isInteger(limit) || limit < 1 || limit > 5000)
  throw new Error('--limit deve estar entre 1 e 5000');

const app = await NestFactory.createApplicationContext(RescanModule, { logger: false });
try {
  const prisma = app.get(PrismaService);
  const processor = app.get(AttachmentProcessorService);
  const files = await prisma.prescriptionFile.findMany({
    where: retryQuarantine
      ? { malwareScanStatus: 'INFECTED', processingStatus: { not: 'DONE' } }
      : {
          malwareScanStatus: all
            ? { not: 'INFECTED' }
            : { in: ['NOT_SCANNED', 'FAILED', 'PENDING'] },
        },
    select: { id: true, submissionId: true },
    orderBy: { id: 'asc' },
    take: limit,
  });
  process.stdout.write(
    `Re-scan: ${files.length} anexo(s) selecionado(s); modo ${apply ? 'execução' : 'relatório'}.\n`,
  );
  if (apply) {
    if (!retryQuarantine) {
      await prisma.prescriptionFile.updateMany({
        where: { id: { in: files.map((file) => file.id) } },
        data: {
          malwareScanStatus: 'PENDING',
          processingStatus: 'PENDING',
          processingErrorCode: null,
        },
      });
    }
    let failed = 0;
    for (const submissionId of new Set(files.map((file) => file.submissionId))) {
      try {
        await processor.processSubmission(submissionId);
      } catch {
        failed += 1;
      }
    }
    process.stdout.write(
      `Re-scan: ${failed} receita(s) com falha; consulte métricas e logs técnicos.\n`,
    );
    if (failed > 0) process.exitCode = 1;
  }
} finally {
  await app.close();
}
