import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { loadRootEnv } from './config/load-env.js';

// O ENV é validado de forma preguiçosa (na criação do provider), então carregar o
// arquivo aqui — antes do NestFactory — é suficiente.
loadRootEnv();

const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
configureApp(app);
await app.listen(app.get<Env>(ENV).API_PORT);
