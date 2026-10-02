import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CpfRevealResponse,
  type FileUrlQuery,
  fileUrlQuerySchema,
  type ListPrescriptionsQuery,
  type SignedFileUrl,
  listPrescriptionsQuerySchema,
  Permission,
  type PrescriptionCounters,
  type PrescriptionCountersQuery,
  type PrescriptionDetail,
  prescriptionCountersQuerySchema,
  type OperationalStatus,
  type PrescriptionListResponse,
  type UpdatePrescriptionStatusInput,
  updatePrescriptionStatusSchema,
} from '@receita/shared';
import { CurrentAuth, RequirePermissions } from '../../common/auth/decorators.js';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PrescriptionFilesService } from './prescription-files.service.js';
import { PrescriptionsService } from './prescriptions.service.js';

@Controller('prescriptions')
@RequirePermissions(Permission.PRESCRIPTIONS_READ)
export class PrescriptionsController {
  constructor(
    private readonly prescriptions: PrescriptionsService,
    private readonly files: PrescriptionFilesService,
  ) {}

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(listPrescriptionsQuerySchema)) query: ListPrescriptionsQuery,
  ): Promise<PrescriptionListResponse> {
    return this.prescriptions.list(auth, query);
  }

  @Get('counters')
  counters(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(prescriptionCountersQuerySchema)) query: PrescriptionCountersQuery,
  ): Promise<PrescriptionCounters> {
    return this.prescriptions.counters(auth, query);
  }

  @Get(':id')
  detail(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<PrescriptionDetail> {
    return this.prescriptions.detail(auth, id);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.PRESCRIPTIONS_UPDATE_STATUS)
  changeStatus(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updatePrescriptionStatusSchema))
    body: UpdatePrescriptionStatusInput,
  ): Promise<{
    operationalStatus: OperationalStatus;
    version: number;
    allowedTransitions: OperationalStatus[];
  }> {
    return this.prescriptions.changeStatus(auth, id, body);
  }

  @Get(':id/files/:fileId/view-url')
  @Header('Cache-Control', 'no-store')
  viewUrl(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('fileId', UuidParamPipe) fileId: string,
    @Query(new ZodValidationPipe(fileUrlQuerySchema)) query: FileUrlQuery,
  ): Promise<SignedFileUrl> {
    return this.files.signedUrl(auth, id, fileId, 'view', query.variant);
  }

  @Get(':id/files/:fileId/download-url')
  @Header('Cache-Control', 'no-store')
  downloadUrl(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('fileId', UuidParamPipe) fileId: string,
  ): Promise<SignedFileUrl> {
    return this.files.signedUrl(auth, id, fileId, 'download');
  }

  @Post(':id/cpf/reveal')
  @RequirePermissions(Permission.PRESCRIPTIONS_REVEAL_CPF)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  revealCpf(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<CpfRevealResponse> {
    return this.files.revealCpf(auth, id);
  }
}
