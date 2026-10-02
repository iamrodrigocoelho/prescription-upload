import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditAction } from '@receita/shared';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { MalwareScanStatus, PrescriptionFile } from '../../generated/prisma/client.js';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { MalwareScanner } from '../malware/malware-scanner.js';
import { AuditService } from '../audit/audit.service.js';
import { buildDerivatives, derivativeKeys } from './derivatives.js';

/**
 * Processamento assíncrono dos anexos de uma receita (PRD §24.7): varredura e
 * derivados de visualização. Idempotente: arquivos já processados são pulados e
 * as chaves dos derivados são determinísticas. Infectados são isolados.
 */
@Injectable()
export class AttachmentProcessorService {
  private readonly logger = new Logger(AttachmentProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly scanner: MalwareScanner,
    private readonly metrics: MetricsService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async processSubmission(submissionId: string): Promise<void> {
    const files = await this.prisma.prescriptionFile.findMany({
      where: { submissionId, processingStatus: { not: 'DONE' } },
      orderBy: { position: 'asc' },
    });
    for (const file of files) {
      if (file.malwareScanStatus === 'INFECTED') {
        if (file.quarantineStorageKey) {
          await this.finishQuarantine(file);
        } else {
          await this.quarantine(file, await this.storage.getObject(file.storageKey));
        }
        continue;
      }
      const content = await this.storage.getObject(file.storageKey);
      let malwareScanStatus: 'CLEAN' | 'INFECTED';
      try {
        malwareScanStatus = await this.scanner.scan({
          fileId: file.id,
          mimeType: file.mimeType,
          content,
        });
      } catch {
        await this.prisma.prescriptionFile.update({
          where: { id: file.id },
          data: { malwareScanStatus: 'FAILED', processingErrorCode: 'scanner_unavailable' },
        });
        this.metrics.securityEvents.inc({ type: 'malware_scanner_unavailable' });
        this.logger.error({ fileId: file.id }, 'ALERTA: scanner de anexos indisponível');
        throw new Error('Scanner de anexos indisponível');
      }
      if (malwareScanStatus === 'INFECTED') {
        await this.prisma.prescriptionFile.update({
          where: { id: file.id },
          data: { malwareScanStatus },
        });
        await this.quarantine(file, content);
        this.metrics.securityEvents.inc({ type: 'malware_detected' });
        this.logger.error({ fileId: file.id }, 'ALERTA: anexo infectado isolado');
        continue;
      }

      // O resultado de segurança independe da geração de derivados. Se HEIC/JPEG
      // falhar no processamento visual, o original já verificado segue acessível.
      await this.prisma.prescriptionFile.update({
        where: { id: file.id },
        data: { malwareScanStatus: 'CLEAN' },
      });

      const derivatives = await buildDerivatives(content, file.mimeType);
      const keys = derivativeKeys(file.id);
      if (derivatives.preview) {
        await this.storage.putObject({
          key: keys.preview,
          body: derivatives.preview,
          contentType: 'image/jpeg',
        });
      }
      if (derivatives.thumbnail) {
        await this.storage.putObject({
          key: keys.thumbnail,
          body: derivatives.thumbnail,
          contentType: 'image/jpeg',
        });
      }
      await this.prisma.prescriptionFile.update({
        where: { id: file.id },
        data: {
          malwareScanStatus,
          processingStatus: 'DONE',
          processingErrorCode: null,
          previewStorageKey: derivatives.preview ? keys.preview : null,
          previewMimeType: derivatives.preview ? 'image/jpeg' : null,
          thumbnailStorageKey: derivatives.thumbnail ? keys.thumbnail : null,
        },
      });
    }
  }

  private async quarantine(file: PrescriptionFile, content: Buffer): Promise<void> {
    const quarantineKey = `quarantine/${file.id}/original`;
    await this.storage.putObject({
      key: quarantineKey,
      body: content,
      contentType: 'application/octet-stream',
    });
    await this.prisma.prescriptionFile.update({
      where: { id: file.id },
      data: { quarantineStorageKey: quarantineKey },
    });
    await this.finishQuarantine(file);
  }

  private async finishQuarantine(file: PrescriptionFile): Promise<void> {
    // O status INFECTED já bloqueia URLs. A exclusão S3 é idempotente; em caso de
    // falha, o próximo retry retoma a partir de quarantineStorageKey.
    await this.storage.deleteObject(file.storageKey);
    if (file.previewStorageKey) await this.storage.deleteObject(file.previewStorageKey);
    if (file.thumbnailStorageKey) await this.storage.deleteObject(file.thumbnailStorageKey);
    await this.prisma.$transaction(async (tx) => {
      await tx.prescriptionFile.update({
        where: { id: file.id },
        data: {
          processingStatus: 'DONE',
          processingErrorCode: null,
          previewStorageKey: null,
          previewMimeType: null,
          thumbnailStorageKey: null,
        },
      });
      await this.audit.record(
        {
          action: AuditAction.PRESCRIPTION_FILE_QUARANTINED,
          entityType: 'PrescriptionFile',
          entityId: file.id,
          metadata: { submissionId: file.submissionId },
        },
        tx,
      );
    });
  }

  /** O alerta de atraso é agregável e não inclui dados pessoais. */
  async reportScanDelays(): Promise<void> {
    const statuses: MalwareScanStatus[] = ['PENDING', 'NOT_SCANNED', 'FAILED'];
    const unverified = { malwareScanStatus: { in: statuses } };
    const [warning, critical] = await Promise.all([
      this.prisma.prescriptionFile.count({
        where: {
          ...unverified,
          createdAt: { lt: new Date(Date.now() - this.env.MALWARE_SCAN_WARN_SECONDS * 1000) },
        },
      }),
      this.prisma.prescriptionFile.count({
        where: {
          ...unverified,
          createdAt: { lt: new Date(Date.now() - this.env.MALWARE_SCAN_CRITICAL_SECONDS * 1000) },
        },
      }),
    ]);
    this.metrics.malwareScanDelayed.set({ threshold: 'warning' }, warning);
    this.metrics.malwareScanDelayed.set({ threshold: 'critical' }, critical);
    if (critical > 0)
      this.logger.error(
        { files: critical },
        'ALERTA: anexos sem varredura há mais de cinco minutos',
      );
    else if (warning > 0)
      this.logger.warn({ files: warning }, 'Anexos sem varredura há mais de dois minutos');
  }

  /**
   * Tentativas esgotadas: marca falha; o anexo permanece bloqueado.
   */
  async markFailed(submissionId: string): Promise<void> {
    const { count } = await this.prisma.prescriptionFile.updateMany({
      where: { submissionId, processingStatus: { not: 'DONE' } },
      data: { processingStatus: 'FAILED', processingErrorCode: 'processing_failed' },
    });
    this.logger.warn({ files: count }, 'Processamento de anexos falhou após todas as tentativas');
  }
}
