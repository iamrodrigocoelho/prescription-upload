import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiErrorCode, type ApiErrorBody } from '@receita/shared';
import type { Response } from 'express';
import { RequestContext } from '../context/request-context.js';
import { AppError, defaultMessage } from '../errors.js';

const STATUS_TO_CODE: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ApiErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ApiErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ApiErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ApiErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ApiErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ApiErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.TOO_MANY_REQUESTS]: ApiErrorCode.RATE_LIMITED,
};

/**
 * Converte qualquer exceção em um corpo de erro padronizado. Detalhes internos
 * (stack, mensagens de bibliotecas, SQL) nunca chegam ao cliente — apenas ao log.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = RequestContext.get()?.requestId;

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiErrorBody['error'];

    if (exception instanceof AppError) {
      status = exception.getStatus();
      body = { code: exception.code, message: exception.message, issues: exception.issues };
      for (const [name, value] of Object.entries(exception.headers ?? {})) {
        response.setHeader(name, value);
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const code = STATUS_TO_CODE[status] ?? ApiErrorCode.INTERNAL_ERROR;
      body = { code, message: defaultMessage(code) };
    } else {
      body = {
        code: ApiErrorCode.INTERNAL_ERROR,
        message: defaultMessage(ApiErrorCode.INTERNAL_ERROR),
      };
    }

    if (status >= 500) {
      this.logger.error({ err: exception }, 'Erro não tratado');
    }

    response.status(status).json({ error: { ...body, requestId } } satisfies ApiErrorBody);
  }
}
