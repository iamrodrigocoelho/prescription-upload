import { Global, Module } from '@nestjs/common';
import { type Env, parseEnv } from './env.js';

export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => parseEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
