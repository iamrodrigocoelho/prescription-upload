import { Module } from '@nestjs/common';
import { RealtimeHub } from './realtime-hub.service.js';
import { RealtimeController } from './realtime.controller.js';

@Module({ controllers: [RealtimeController], providers: [RealtimeHub] })
export class RealtimeModule {}
