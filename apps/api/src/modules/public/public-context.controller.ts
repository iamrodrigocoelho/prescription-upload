import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  type PublicPatientLinkContext,
  type PublicStoreSearchItem,
  type PublicStoreSearchQuery,
  publicStoreSearchQuerySchema,
  type PublicStoreView,
} from '@receita/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public } from '../../common/auth/decorators.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimitService } from '../../infra/rate-limit/rate-limit.service.js';
import { PatientLinkSessionService } from './patient-link-session.service.js';
import { PublicContextService } from './public-context.service.js';

const openSessionSchema = z.object({ token: z.string().max(64) }).strict();

/** Rotas públicas de contexto (sem autenticação; rate limit por IP). */
@Controller('public')
@Public()
export class PublicContextController {
  constructor(
    private readonly context: PublicContextService,
    private readonly rateLimit: RateLimitService,
    private readonly sessions: PatientLinkSessionService,
  ) {}

  @Get('stores')
  async search(
    @Req() req: Request,
    @Query(new ZodValidationPipe(publicStoreSearchQuerySchema)) query: PublicStoreSearchQuery,
  ): Promise<{ items: PublicStoreSearchItem[] }> {
    await this.rateLimit.consume('publicLookupIp', req.ip ?? 'unknown');
    return { items: await this.context.searchStores(query.search) };
  }

  @Get('stores/:slug')
  async store(@Req() req: Request, @Param('slug') slug: string): Promise<PublicStoreView> {
    await this.rateLimit.consume('publicLookupIp', req.ip ?? 'unknown');
    return this.context.storeBySlug(slug);
  }

  @Get('patient-links/:token')
  async patientLink(
    @Req() req: Request,
    @Param('token') token: string,
  ): Promise<PublicPatientLinkContext> {
    await this.rateLimit.consume('publicLookupIp', req.ip ?? 'unknown');
    const { storeNumber, storeName } = await this.context.patientLinkContext(token);
    return { storeNumber, storeName };
  }

  /** Troca o token (no corpo, nunca na URL) por um contexto em cookie (D-047). */
  @Post('patient-link-sessions')
  @HttpCode(HttpStatus.OK)
  async openSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(openSessionSchema)) body: { token: string },
  ): Promise<PublicPatientLinkContext> {
    await this.rateLimit.consume('publicLookupIp', req.ip ?? 'unknown');
    const { linkId, storeNumber, storeName } = await this.context.patientLinkContext(body.token);
    await this.sessions.open(res, linkId);
    return { storeNumber, storeName };
  }

  @Get('patient-link-sessions/current')
  async currentSession(@Req() req: Request): Promise<PublicPatientLinkContext> {
    await this.rateLimit.consume('publicLookupIp', req.ip ?? 'unknown');
    return this.context.patientLinkContextById(await this.sessions.linkIdFrom(req));
  }
}
