import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageProvider } from '../../infra/storage/storage.provider.js';

/**
 * Remove objetos que não pertencem a nenhuma receita (envio falhou após o upload).
 * Se a remoção falhar, registra em `orphaned_objects` para limpeza posterior.
 */
@Injectable()
export class StorageCleanupService {
  private readonly logger = new Logger(StorageCleanupService.name);

  constructor(
    private readonly storage: StorageProvider,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async removeObjects(keys: readonly string[], reason: string): Promise<void> {
    await Promise.all(
      keys.map(async (storageKey) => {
        try {
          await this.storage.deleteObject(storageKey);
        } catch (error) {
          this.metrics.storageFailures.inc({ operation: 'delete' });
          this.logger.error(
            { err: error },
            'Falha ao remover objeto órfão; registrado para limpeza',
          );
          await this.prisma.orphanedObject
            .create({ data: { storageKey, reason: reason.slice(0, 120) } })
            .catch((dbError: unknown) =>
              this.logger.error({ err: dbError }, 'Falha ao registrar objeto órfão'),
            );
        }
      }),
    );
  }
}
