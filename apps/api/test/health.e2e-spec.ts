import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MalwareScanner } from '../src/modules/malware/malware-scanner.js';
import { createTestApp, createTestContext } from './utils/app.js';

describe('Health e headers de segurança (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('aplica headers de segurança (Helmet + CSP)', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
    // HSTS apenas em produção.
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('propaga um correlation ID válido recebido do cliente', async () => {
    const id = '0b8f8a52-6c1e-4f0a-9d7e-2f6f3b1a9c11';
    const res = await request(app.getHttpServer()).get('/health').set('x-request-id', id);
    expect(res.headers['x-request-id']).toBe(id);
  });

  it('substitui correlation ID inválido por um UUID gerado', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', '<script>alert(1)</script>');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rota inexistente retorna erro padronizado com requestId', async () => {
    const res = await request(app.getHttpServer()).get('/nao-existe').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });
});

describe('Readiness (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/ready verifica o banco', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body).toEqual({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok', storage: 'ok', antivirus: 'ok' },
    });
  });

  it('readiness falha quando o antivírus está indisponível', async () => {
    const ctx = await createTestContext([
      { provide: MalwareScanner, useValue: { ping: () => Promise.reject(new Error('simulado')) } },
    ]);
    try {
      await request(ctx.app.getHttpServer()).get('/health/ready').expect(503);
    } finally {
      await ctx.app.close();
    }
  });
});
