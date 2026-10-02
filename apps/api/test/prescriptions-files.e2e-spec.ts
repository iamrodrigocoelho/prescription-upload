import { AuditAction } from '@receita/shared';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { generateStorageKey } from '../src/infra/storage/storage-key.js';
import { StorageProvider } from '../src/infra/storage/storage.provider.js';
import { JPEG } from './fixtures/files.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createSubmission, createUser } from './utils/factories.js';
import { loginAs } from './utils/http.js';

describe('Anexos e CPF (e2e)', () => {
  let ctx: TestContext;
  let crypto: CryptoService;
  let storage: StorageProvider;

  beforeAll(async () => {
    ctx = await createTestContext();
    crypto = ctx.app.get(CryptoService);
    storage = ctx.app.get(StorageProvider);
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function setup() {
    const a = await createStore(ctx.prisma);
    const b = await createStore(ctx.prisma);
    const collaborator = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, {
        role: 'STORE_COLLABORATOR',
        storeIds: [a.id],
        name: 'Ana Lima',
      }),
    );
    return { a, b, collaborator };
  }

  it('CA-009: download gera URL assinada (attachment) funcional e AuditLog com os campos do PRD §13.2', async () => {
    const { a, collaborator } = await setup();
    const key = generateStorageKey('test');
    const content = JPEG(3000);
    await storage.putObject({ key, body: content, contentType: 'image/jpeg' });
    const s = await createSubmission(ctx.prisma, crypto, {
      storeId: a.id,
      files: [{ storageKey: key }],
    });
    const fileId = s.files[0]!.id;

    const res = await collaborator
      .get(`/prescriptions/${s.id}/files/${fileId}/download-url`)
      .expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.url).toContain('X-Amz-Signature=');
    expect(res.body.url).not.toContain('receita-1.jpg');
    const download = await fetch(res.body.url as string);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(content);

    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: AuditAction.PRESCRIPTION_FILE_DOWNLOADED, entityId: fileId },
    });
    expect(audit).toMatchObject({
      actorUserId: expect.any(String),
      actorRole: 'STORE_COLLABORATOR',
      entityType: 'PrescriptionFile',
      storeId: a.id,
      metadata: { submissionId: s.id, filePosition: 1, variant: 'original' },
    });
    expect(audit?.createdAt).toBeInstanceOf(Date);
    expect(JSON.stringify(audit)).not.toContain('X-Amz');
    await storage.deleteObject(key);
  });

  it('visualização também é auditada (inline) e aparece no histórico', async () => {
    const { a, collaborator } = await setup();
    const s = await createSubmission(ctx.prisma, crypto, { storeId: a.id });
    const fileId = s.files[0]!.id;
    const res = await collaborator
      .get(`/prescriptions/${s.id}/files/${fileId}/view-url`)
      .expect(200);
    expect(decodeURIComponent(res.body.url as string)).toContain('inline;');
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: AuditAction.PRESCRIPTION_FILE_VIEWED, entityId: fileId },
      }),
    ).toBe(1);
    const detail = await collaborator.get(`/prescriptions/${s.id}`).expect(200);
    expect(
      detail.body.timeline.find((e: { type: string }) => e.type === 'file_viewed'),
    ).toMatchObject({
      actorName: 'Ana Lima',
      filePosition: 1,
    });
  });

  it('IDOR: fileId de outra receita retorna 404', async () => {
    const { a, collaborator } = await setup();
    const s1 = await createSubmission(ctx.prisma, crypto, { storeId: a.id });
    const s2 = await createSubmission(ctx.prisma, crypto, { storeId: a.id });
    await collaborator.get(`/prescriptions/${s1.id}/files/${s2.files[0]!.id}/view-url`).expect(404);
    await collaborator
      .get(`/prescriptions/${s1.id}/files/${s2.files[0]!.id}/download-url`)
      .expect(404);
  });

  it('CA-007: não obtém URL de arquivo de outra loja (404) e nada é auditado como acesso', async () => {
    const { b, collaborator } = await setup();
    const s = await createSubmission(ctx.prisma, crypto, { storeId: b.id });
    await collaborator.get(`/prescriptions/${s.id}/files/${s.files[0]!.id}/view-url`).expect(404);
    await collaborator
      .get(`/prescriptions/${s.id}/files/${s.files[0]!.id}/download-url`)
      .expect(404);
    expect(
      await ctx.prisma.auditLog.count({
        where: {
          action: {
            in: [AuditAction.PRESCRIPTION_FILE_VIEWED, AuditAction.PRESCRIPTION_FILE_DOWNLOADED],
          },
          entityId: s.files[0]!.id,
        },
      }),
    ).toBe(0);
  });

  it('somente CLEAN gera URL; INFECTED, NOT_SCANNED e PENDING são bloqueados', async () => {
    const { a, collaborator } = await setup();
    const s = await createSubmission(ctx.prisma, crypto, {
      storeId: a.id,
      files: [
        { malwareScanStatus: 'INFECTED' },
        { malwareScanStatus: 'NOT_SCANNED' },
        { malwareScanStatus: 'PENDING' },
        { malwareScanStatus: 'CLEAN' },
      ],
    });
    const [infected, notScanned, pending, clean] = s.files.sort((x, y) => x.position - y.position);
    await collaborator.get(`/prescriptions/${s.id}/files/${infected!.id}/view-url`).expect(403);
    await collaborator.get(`/prescriptions/${s.id}/files/${infected!.id}/download-url`).expect(403);
    await collaborator
      .get(`/prescriptions/${s.id}/files/${notScanned!.id}/download-url`)
      .expect(403);
    await collaborator.get(`/prescriptions/${s.id}/files/${pending!.id}/view-url`).expect(403);
    await collaborator.get(`/prescriptions/${s.id}/files/${clean!.id}/view-url`).expect(200);
    const detail = await collaborator.get(`/prescriptions/${s.id}`).expect(200);
    expect(detail.body.files.map((f: { accessible: boolean }) => f.accessible)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it('HEIC sem derivado: pré-visualização indisponível, download liberado', async () => {
    const { a, collaborator } = await setup();
    const s = await createSubmission(ctx.prisma, crypto, {
      storeId: a.id,
      files: [{ mimeType: 'image/heic' }],
    });
    const fileId = s.files[0]!.id;
    await collaborator
      .get(`/prescriptions/${s.id}/files/${fileId}/view-url?variant=preview`)
      .expect(404);
    await collaborator
      .get(`/prescriptions/${s.id}/files/${fileId}/view-url?variant=thumbnail`)
      .expect(404);
    await collaborator.get(`/prescriptions/${s.id}/files/${fileId}/download-url`).expect(200);
  });

  describe('revelação do CPF', () => {
    it('revela uma vez por chamada, sem cache, e audita sem o valor', async () => {
      const { a, collaborator } = await setup();
      const s = await createSubmission(ctx.prisma, crypto, { storeId: a.id, cpf: '52998224725' });
      const res = await collaborator.post(`/prescriptions/${s.id}/cpf/reveal`).expect(200);
      expect(res.body).toEqual({ cpf: '529.982.247-25' });
      expect(res.headers['cache-control']).toBe('no-store');
      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: AuditAction.PRESCRIPTION_CPF_REVEALED, entityId: s.id },
      });
      expect(audit).toMatchObject({ storeId: a.id, actorRole: 'STORE_COLLABORATOR' });
      expect(JSON.stringify(audit)).not.toContain('52998224725');
      expect(JSON.stringify(audit)).not.toContain('529.982.247-25');
    });

    it('fora do escopo → 404; sem CPF → 404', async () => {
      const { a, b, collaborator } = await setup();
      const other = await createSubmission(ctx.prisma, crypto, {
        storeId: b.id,
        cpf: '52998224725',
      });
      await collaborator.post(`/prescriptions/${other.id}/cpf/reveal`).expect(404);
      const noCpf = await createSubmission(ctx.prisma, crypto, { storeId: a.id });
      await collaborator.post(`/prescriptions/${noCpf.id}/cpf/reveal`).expect(404);
      expect(
        await ctx.prisma.auditLog.count({
          where: { action: AuditAction.PRESCRIPTION_CPF_REVEALED, entityId: other.id },
        }),
      ).toBe(0);
    });

    it('aplica rate limit por usuário', async () => {
      const { a, collaborator } = await setup();
      const s = await createSubmission(ctx.prisma, crypto, { storeId: a.id, cpf: '52998224725' });
      for (let i = 0; i < 30; i += 1)
        await collaborator.post(`/prescriptions/${s.id}/cpf/reveal`).expect(200);
      await collaborator.post(`/prescriptions/${s.id}/cpf/reveal`).expect(429);
    });

    it('exige o token CSRF (POST)', async () => {
      const { a, collaborator } = await setup();
      const s = await createSubmission(ctx.prisma, crypto, { storeId: a.id, cpf: '52998224725' });
      await collaborator.agent.post(`/prescriptions/${s.id}/cpf/reveal`).expect(403);
    });
  });
});
