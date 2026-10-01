import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { contentDisposition } from './storage-key.js';
import {
  type ObjectInfo,
  type PutObjectInput,
  type PutObjectStreamInput,
  type SignedUrlOptions,
  StorageProvider,
} from './storage.provider.js';

/**
 * Adapter S3-compatible (SeaweedFS em dev/self-hosted). O bucket é privado: não
 * há política pública nem ACL de leitura anônima; todo acesso é assinado (SigV4).
 */
@Injectable()
export class S3StorageProvider extends StorageProvider implements OnModuleInit {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.bucket = env.STORAGE_BUCKET;
    this.client = new S3Client({
      endpoint: env.STORAGE_ENDPOINT,
      region: env.STORAGE_REGION,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY },
      // Envia checksum apenas quando a operação exige (compatibilidade com SeaweedFS).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  /** Em dev/test cria o bucket se não existir; em produção ele deve ser provisionado. */
  async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === 'production') return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (
        !(error instanceof NotFound) &&
        !(error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
      ) {
        this.logger.warn({ err: error }, 'Storage indisponível na inicialização');
        return;
      }
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket privado criado: ${this.bucket}`);
    }
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.body.length,
        Metadata: input.sha256 ? { sha256: input.sha256 } : undefined,
      }),
    );
  }

  async putObjectStream(input: PutObjectStreamInput): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      },
      // Arquivos de receita têm até 5 MB: cabem em uma parte (sem multipart real).
      partSize: 5 * 1024 * 1024 + 1024,
      queueSize: 1,
      leavePartsOnError: false,
    });
    const onAbort = (): void => {
      void upload.abort();
    };
    input.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      await upload.done();
    } finally {
      input.signal?.removeEventListener('abort', onAbort);
    }
  }

  getSignedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: options.contentType,
      ResponseContentDisposition: contentDisposition(options.disposition, options.filename),
      ResponseCacheControl: 'private, no-store',
    });
    return getSignedUrl(this.client, command, {
      expiresIn: options.ttlSeconds ?? this.env.SIGNED_URL_TTL_SECONDS,
    });
  }

  async headObject(key: string): Promise<ObjectInfo | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: head.ContentLength ?? 0, contentType: head.ContentType };
    } catch (error) {
      if (
        error instanceof NotFound ||
        (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
      ) {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
