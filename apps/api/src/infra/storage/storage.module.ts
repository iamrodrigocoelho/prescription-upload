import { Global, Module } from '@nestjs/common';
import { S3StorageProvider } from './s3-storage.provider.js';
import { StorageProvider } from './storage.provider.js';

@Global()
@Module({
  providers: [{ provide: StorageProvider, useClass: S3StorageProvider }],
  exports: [StorageProvider],
})
export class StorageModule {}
