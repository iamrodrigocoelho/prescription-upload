import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createSubmission } from './utils/factories.js';

/**
 * Regressão de D-078: datas gravadas pela aplicação preservam o instante exato,
 * qualquer que seja o fuso padrão do servidor Postgres.
 */
describe('Fuso da conexão com o banco (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.app.close());

  it('a sessão usa UTC', async () => {
    const [row] = await ctx.prisma.$queryRaw<
      { tz: string }[]
    >`SELECT current_setting('TimeZone') AS tz`;
    expect(row?.tz).toBe('UTC');
  });

  it('um Date gravado e um parâmetro Date representam o mesmo instante no banco', async () => {
    const instant = new Date('2026-10-02T02:30:00.000Z');
    const store = await createStore(ctx.prisma);
    const submission = await createSubmission(ctx.prisma, ctx.app.get(CryptoService), {
      storeId: store.id,
      createdAt: instant,
    });
    const [row] = await ctx.prisma.$queryRaw<{ epoch: number; param: number }[]>`
      SELECT EXTRACT(EPOCH FROM created_at)::float8 AS epoch,
             EXTRACT(EPOCH FROM ${instant}::timestamptz)::float8 AS param
        FROM prescription_submissions WHERE id = ${submission.id}::uuid`;
    expect(row?.epoch).toBe(instant.getTime() / 1000);
    expect(row?.param).toBe(instant.getTime() / 1000);
    const read = await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({
      where: { id: submission.id },
    });
    expect(read.createdAt.toISOString()).toBe(instant.toISOString());
  });

  it('datas da aplicação e now() do banco são comparáveis', async () => {
    const [row] = await ctx.prisma.$queryRaw<{ diff: number }[]>`
      SELECT abs(EXTRACT(EPOCH FROM now() - ${new Date()}::timestamptz))::float8 AS diff`;
    expect(row?.diff).toBeLessThan(5);
  });
});
