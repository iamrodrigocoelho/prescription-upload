import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { MalwareScanner } from '../malware/malware-scanner.js';
import { buildDerivatives, derivativeKeys } from './derivatives.js';

/**
 * Processamento assíncrono dos anexos de uma receita (PRD §24.7): varredura e
 * derivados de visualização. Idempotente: arquivos já processados são pulados e
 * as chaves dos derivados são determinísticas. O original nunca é alterado.
 */
@Injectable()
export class AttachmentProcessorService {
  private readonly logger = new Logger(AttachmentProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly scanner: MalwareScanner,
    private readonly metrics: MetricsService,
  ) {}

  async processSubmission(submissionId: string): Promise<void> {
    const files = await this.prisma.prescriptionFile.findMany({
      where: { submissionId, processingStatus: { not: 'DONE' } },
      orderBy: { position: 'asc' },
    });
    for (const file of files) {
      const content = await this.storage.getObject(file.storageKey);
      const malwareScanStatus = await this.scanner.scan({
        fileId: file.id,
        mimeType: file.mimeType,
        content,
      });
      if (malwareScanStatus === 'INFECTED') {
        await this.prisma.prescriptionFile.update({
          where: { id: file.id },
          data: { malwareScanStatus, processingStatus: 'DONE' },
        });
        this.metrics.securityEvents.inc({ type: 'malware_detected' });
        continue;
      }

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

  /**
   * Tentativas esgotadas: marca a falha. A receita continua visível no Admin e o
   * anexo oferece download (o original está intacto).
   */
  async markFailed(submissionId: string): Promise<void> {
    const { count } = await this.prisma.prescriptionFile.updateMany({
      where: { submissionId, processingStatus: { not: 'DONE' } },
      data: { processingStatus: 'FAILED', processingErrorCode: 'processing_failed' },
    });
    this.logger.warn({ files: count }, 'Processamento de anexos falhou após todas as tentativas');
  }
}
