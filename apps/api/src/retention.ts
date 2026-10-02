import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadRootEnv } from './config/load-env.js';
import { RetentionService } from './modules/retention/retention.service.js';
import { RetentionCliModule } from './retention.module.js';

loadRootEnv();
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const retry = args.has('--retry');
const limitArg = [...args].find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 100;
if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
  throw new Error('--limit deve estar entre 1 e 1000');
}
if (retry && !apply) throw new Error('--retry exige --apply');

const app = await NestFactory.createApplicationContext(RetentionCliModule, { logger: false });
try {
  const retention = app.get(RetentionService);
  if (apply) {
    const result = await retention.execute(limit, retry);
    process.stdout.write(
      JSON.stringify({ mode: 'apply', disposedIds: result.disposed, failedIds: result.failed }) +
        '\n',
    );
    if (result.failed.length > 0) process.exitCode = 1;
  } else {
    const rows = await retention.report(limit);
    process.stdout.write(JSON.stringify({ mode: 'dry-run', count: rows.length, rows }) + '\n');
  }
} finally {
  await app.close();
}
