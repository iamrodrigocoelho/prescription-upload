import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import {
  type PublicPatientLinkContext,
  type PublicStoreSearchItem,
  type PublicStoreSearchQuery,
  publicStoreSearchQuerySchema,
  type PublicStoreView,
} from '@receita/shared';
import type { Request } from 'express';
import { Public } from '../../common/auth/decorators.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimitService } from '../../infra/rate-limit/rate-limit.service.js';
import { PublicContextService } from './public-context.service.js';

/** Rotas públicas de contexto (sem autenticação; rate limit por IP). */
@Controller('public')
@Public()
export class PublicContextController {
  constructor(
    private readonly context: PublicContextService,
    private readonly rateLimit: RateLimitService,
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
    return this.context.patientLinkContext(token);
  }
}
