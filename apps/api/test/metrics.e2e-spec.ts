import request from 'supertest';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore } from './utils/factories.js';

describe('Métricas (e2e)', () => {
  let ctx: TestContext;
  const token = () => process.env.METRICS_TOKEN ?? '';

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  it('exige o token Bearer', async () => {
    await http().get('/metrics').expect(401);
    await http().get('/metrics').set('Authorization', 'Bearer errado').expect(401);
  });

  it('expõe latência por template de rota, sem valores concretos de path', async () => {
    await ctx.reset();
    const store = await createStore(ctx.prisma);
    await http().get(`/public/stores/${store.publicSlug}`).expect(200);
    await http()
      .get(`/public/patient-links/${'Z'.repeat(43)}`)
      .expect(404);

    const res = await http().get('/metrics').set('Authorization', `Bearer ${token()}`).expect(200);
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toContain('route="/public/stores/:slug"');
    expect(res.text).toContain('route="/public/patient-links/:token"');
    expect(res.text).not.toContain(store.publicSlug);
    expect(res.text).not.toContain('Z'.repeat(43));
  });
});
