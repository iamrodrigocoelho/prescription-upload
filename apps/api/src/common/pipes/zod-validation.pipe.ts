import { type PipeTransform } from '@nestjs/common';
import { ApiErrorCode } from '@receita/shared';
import type { z } from 'zod';
import { AppError } from '../errors.js';

/**
 * Valida a entrada com um schema Zod. As issues retornadas contêm apenas o
 * caminho e a mensagem — nunca o valor recebido (que pode ser CPF ou senha).
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError(
        ApiErrorCode.VALIDATION_FAILED,
        undefined,
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
