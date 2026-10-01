import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiErrorCode,
  type CreateStoreInput,
  createStoreSchema,
  type ListStoresQuery,
  listStoresQuerySchema,
  type Paginated,
  Permission,
  type StoreImportReport,
  type StoreView,
  type UpdateStoreInput,
  updateStoreSchema,
} from '@receita/shared';
import { CurrentAuth, RequirePermissions } from '../../common/auth/decorators.js';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { StoresService } from './stores.service.js';

/** Subconjunto do arquivo entregue pelo multer (memória). */
interface UploadedCsv {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const CSV_MIME_TYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/csv',
]);

@Controller('admin/stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  @RequirePermissions(Permission.STORES_READ)
  list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(listStoresQuerySchema)) query: ListStoresQuery,
  ): Promise<Paginated<StoreView>> {
    return this.stores.list(auth, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.STORES_READ)
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<StoreView> {
    return this.stores.toView(await this.stores.getScoped(auth, id));
  }

  @Get(':id/public-link')
  @RequirePermissions(Permission.STORES_READ)
  async publicLink(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<{ url: string; active: boolean }> {
    const store = await this.stores.getScoped(auth, id);
    return { url: this.stores.publicUrl(store), active: store.active };
  }

  @Post()
  @RequirePermissions(Permission.STORES_MANAGE)
  create(
    @Body(new ZodValidationPipe(createStoreSchema)) body: CreateStoreInput,
  ): Promise<StoreView> {
    return this.stores.create(body);
  }

  @Patch(':id')
  @RequirePermissions(Permission.STORES_MANAGE)
  update(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateStoreSchema)) body: UpdateStoreInput,
  ): Promise<StoreView> {
    return this.stores.update(id, body);
  }

  /** Multipart com o campo `file`. `?dryRun=true` valida sem gravar (pré-visualização). */
  @Post('import')
  @RequirePermissions(Permission.STORES_MANAGE)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CSV_BYTES, files: 1 } }))
  import(
    @UploadedFile() file: UploadedCsv | undefined,
    @Query('dryRun') dryRun?: string,
  ): Promise<StoreImportReport> {
    if (!file) {
      throw new AppError(ApiErrorCode.VALIDATION_FAILED, undefined, [
        { path: 'file', message: 'Envie um arquivo CSV.' },
      ]);
    }
    const looksLikeCsv = /\.csv$/i.test(file.originalname) || CSV_MIME_TYPES.has(file.mimetype);
    if (!looksLikeCsv) {
      throw new AppError(ApiErrorCode.VALIDATION_FAILED, undefined, [
        { path: 'file', message: 'O arquivo deve estar no formato CSV.' },
      ]);
    }
    const content = file.buffer.toString('utf8');
    if (content.includes('\u0000')) {
      throw new AppError(ApiErrorCode.VALIDATION_FAILED, undefined, [
        { path: 'file', message: 'O arquivo deve estar no formato CSV (texto UTF-8).' },
      ]);
    }
    return this.stores.import(content, dryRun === 'true');
  }
}
