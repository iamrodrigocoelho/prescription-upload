import { type PipeTransform } from '@nestjs/common';
import { ApiErrorCode } from '@receita/shared';
import { z } from 'zod';
import { AppError } from '../errors.js';

const uuid = z.uuid();

/** Valida IDs de rota; IDs malformados são tratados como inexistentes (404). */
export class UuidParamPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    const result = uuid.safeParse(value);
    if (!result.success) throw new AppError(ApiErrorCode.NOT_FOUND);
    return result.data;
  }
}
