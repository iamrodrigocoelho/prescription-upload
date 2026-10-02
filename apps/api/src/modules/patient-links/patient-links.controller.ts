import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  type CreatePatientLinkInput,
  type CreatePatientLinkResponse,
  createPatientLinkSchema,
  type ListPatientLinksQuery,
  listPatientLinksQuerySchema,
  type Paginated,
  type PatientLinkOptions,
  type PatientLinkView,
  Permission,
} from '@receita/shared';
import { CurrentAuth, RequirePermissions, RouteScope } from '../../common/auth/decorators.js';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PatientLinksService } from './patient-links.service.js';

@Controller('admin/patient-links')
@RouteScope('STORE')
export class PatientLinksController {
  constructor(private readonly links: PatientLinksService) {}

  @Get()
  @RequirePermissions(Permission.PATIENT_LINKS_READ)
  list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(listPatientLinksQuerySchema)) query: ListPatientLinksQuery,
  ): Promise<Paginated<PatientLinkView>> {
    return this.links.list(auth, query);
  }

  @Get('options')
  @RequirePermissions(Permission.PATIENT_LINKS_MANAGE)
  options(): Promise<PatientLinkOptions> {
    return this.links.options();
  }

  @Post()
  @RequirePermissions(Permission.PATIENT_LINKS_MANAGE)
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createPatientLinkSchema)) body: CreatePatientLinkInput,
  ): Promise<CreatePatientLinkResponse> {
    return this.links.create(auth, body);
  }

  @Post(':id/revoke')
  @RequirePermissions(Permission.PATIENT_LINKS_MANAGE)
  @HttpCode(HttpStatus.OK)
  revoke(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<PatientLinkView> {
    return this.links.revoke(auth, id);
  }
}
