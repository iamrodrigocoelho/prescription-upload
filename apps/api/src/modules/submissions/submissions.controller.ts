import { Controller, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import type { SubmissionResponse } from '@receita/shared';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/decorators.js';
import { PatientLinkSessionService } from '../public/patient-link-session.service.js';
import { SubmissionsService } from './submissions.service.js';

/** Envio público de receitas (PRD §26.1). Multipart; campos antes dos arquivos. */
@Controller('public')
@Public()
export class SubmissionsController {
  constructor(
    private readonly submissions: SubmissionsService,
    private readonly sessions: PatientLinkSessionService,
  ) {}

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

  /** Link personalizado pelo contexto em cookie (D-047); encerra o contexto após o envio. */
  @Post('patient-link-sessions/current/prescriptions')
  @HttpCode(HttpStatus.CREATED)
  async submitWithSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SubmissionResponse> {
    const linkId = await this.sessions.linkIdFrom(req);
    const result = await this.submissions.submit(req, { type: 'personalized-session', linkId });
    await this.sessions.close(req, res);
    return result;
  }
}
