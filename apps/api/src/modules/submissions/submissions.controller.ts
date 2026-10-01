import { Controller, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { SubmissionResponse } from '@receita/shared';
import type { Request } from 'express';
import { Public } from '../../common/auth/decorators.js';
import { SubmissionsService } from './submissions.service.js';

/** Envio público de receitas (PRD §26.1). Multipart; campos antes dos arquivos. */
@Controller('public')
@Public()
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  /** Link da loja (`slug`) ou entrada genérica (`storeId`). */
  @Post('prescriptions')
  @HttpCode(HttpStatus.CREATED)
  submit(@Req() req: Request): Promise<SubmissionResponse> {
    return this.submissions.submit(req, { type: 'public' });
  }

  /** Link personalizado: loja e paciente vêm exclusivamente do token. */
  @Post('patient-links/:token/prescriptions')
  @HttpCode(HttpStatus.CREATED)
  submitWithLink(@Req() req: Request, @Param('token') token: string): Promise<SubmissionResponse> {
    return this.submissions.submit(req, { type: 'personalized', token });
  }
}
