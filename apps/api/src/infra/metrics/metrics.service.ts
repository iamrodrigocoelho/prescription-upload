import { Injectable } from '@nestjs/common';
import { Counter, collectDefaultMetrics, Histogram, Registry } from 'prom-client';

/**
 * Métricas Prometheus (PRD §34). Labels nunca carregam dados pessoais, tokens ou
 * URLs concretas — apenas o template da rota e categorias fechadas.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Latência das requisições HTTP por rota (template) e status',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  readonly captchaVerifications = new Counter({
    name: 'captcha_verifications_total',
    help: 'Verificações de captcha por resultado',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly submissions = new Counter({
    name: 'prescription_submissions_total',
    help: 'Envios públicos de receita por canal e resultado',
    labelNames: ['channel', 'result'] as const,
    registers: [this.registry],
  });

  readonly uploadedFiles = new Counter({
    name: 'prescription_files_uploaded_total',
    help: 'Arquivos de receita armazenados por tipo',
    labelNames: ['type'] as const,
    registers: [this.registry],
  });

  readonly rejectedFiles = new Counter({
    name: 'prescription_files_rejected_total',
    help: 'Arquivos rejeitados no servidor por motivo',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });

  readonly storageFailures = new Counter({
    name: 'storage_failures_total',
    help: 'Falhas de object storage por operação',
    labelNames: ['operation'] as const,
    registers: [this.registry],
  });

  readonly securityEvents = new Counter({
    name: 'security_events_total',
    help: 'Eventos de segurança por tipo',
    labelNames: ['type'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }
}
