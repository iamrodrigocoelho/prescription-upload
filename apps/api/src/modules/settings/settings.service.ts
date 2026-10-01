import { Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  type SystemSettings,
  systemSettingsSchema,
  type UpdateSystemSettingsInput,
} from '@receita/shared';
import { RequestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

const KEYS = Object.keys(systemSettingsSchema.shape) as (keyof SystemSettings)[];

/** Parâmetros globais do sistema (retenção, expiração de links). */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getAll(): Promise<SystemSettings> {
    const rows = await this.prisma.systemSetting.findMany({ where: { key: { in: KEYS } } });
    const raw = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    // Valores ausentes ou corrompidos são erro de configuração, não de entrada.
    return systemSettingsSchema.parse(raw);
  }

  async update(input: UpdateSystemSettingsInput): Promise<SystemSettings> {
    const current = await this.getAll();
    const parsed = systemSettingsSchema.safeParse({ ...current, ...input });
    if (!parsed.success) {
      throw new AppError(
        ApiErrorCode.VALIDATION_FAILED,
        undefined,
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    const next = parsed.data;
    const changed = KEYS.filter((key) => next[key] !== current[key]);
    if (changed.length === 0) return current;

    const updatedByUserId = RequestContext.get()?.userId ?? null;
    await this.prisma.$transaction(async (tx) => {
      for (const key of changed) {
        await tx.systemSetting.update({
          where: { key },
          data: { value: next[key], updatedByUserId },
        });
      }
      await this.audit.record(
        {
          action: AuditAction.SETTINGS_UPDATED,
          entityType: 'SystemSetting',
          metadata: {
            changes: Object.fromEntries(
              changed.map((key) => [key, { from: current[key], to: next[key] }]),
            ),
          },
        },
        tx,
      );
    });
    return next;
  }
}
