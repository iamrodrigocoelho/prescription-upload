import { createHash } from 'node:crypto';
import { generateStorageKey } from '../src/infra/storage/storage-key.js';
import { StorageProvider } from '../src/infra/storage/storage.provider.js';
import { createTestContext, type TestContext } from './utils/app.js';

/**
 * Integração com o object storage S3-compatible (SeaweedFS). Requer o serviço em
 * STORAGE_ENDPOINT (docker compose ou instalação local).
 */
describe('Storage privado (integração)', () => {
  let ctx: TestContext;
  let storage: StorageProvider;
  const endpoint = () => process.env.STORAGE_ENDPOINT ?? '';
  const bucket = () => process.env.STORAGE_BUCKET ?? '';

  beforeAll(async () => {
    ctx = await createTestContext();
    storage = ctx.app.get(StorageProvider);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function putSample(content = 'conteúdo de teste %PDF') {
    const key = generateStorageKey('test');
    const body = Buffer.from(content, 'utf8');
    await storage.putObject({
      key,
      body,
      contentType: 'application/pdf',
      sha256: createHash('sha256').update(body).digest('hex'),
    });
    return { key, body };
  }

  it('grava e lê via URL assinada, com headers de resposta controlados', async () => {
    const { key, body } = await putSample();
    const url = await storage.getSignedUrl(key, {
      disposition: 'attachment',
      filename: 'Receita João.pdf',
      contentType: 'application/pdf',
    });
    expect(url).toContain('X-Amz-Signature=');
    expect(url).toContain('X-Amz-Expires=60');

    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(body);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('attachment;');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('bucket privado: objeto e listagem negados sem assinatura', async () => {
    const { key } = await putSample();
    const object = await fetch(`${endpoint()}/${bucket()}/${key}`);
    expect(object.status).toBe(403);
    const listing = await fetch(`${endpoint()}/${bucket()}/`);
    expect(listing.status).toBe(403);
  });

  it('URL adulterada é rejeitada', async () => {
    const { key } = await putSample();
    const url = new URL(
      await storage.getSignedUrl(key, {
        disposition: 'inline',
        filename: 'x.pdf',
        contentType: 'application/pdf',
      }),
    );
    // Trocar o disposition invalida a assinatura.
    url.searchParams.set('response-content-disposition', 'inline; filename="outro.pdf"');
    expect((await fetch(url)).status).toBe(403);
  });

  it('URL assinada expira (TTL curto)', async () => {
    const { key } = await putSample();
    const url = await storage.getSignedUrl(key, {
      disposition: 'inline',
      filename: 'x.pdf',
      contentType: 'application/pdf',
      ttlSeconds: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect((await fetch(url)).status).toBe(403);
  });

  it('upload em streaming grava o conteúdo completo', async () => {
    const { Readable } = await import('node:stream');
    const key = generateStorageKey('test');
    const chunks = [Buffer.alloc(300_000, 1), Buffer.alloc(300_000, 2), Buffer.from('fim')];
    await storage.putObjectStream({ key, body: Readable.from(chunks), contentType: 'image/jpeg' });
    await expect(storage.headObject(key)).resolves.toEqual({
      size: 600_003,
      contentType: 'image/jpeg',
    });
    await storage.deleteObject(key);
  });

  it('upload em streaming abortado não deixa objeto', async () => {
    const { Readable } = await import('node:stream');
    const key = generateStorageKey('test');
    const controller = new AbortController();
    const body = new Readable({ read() {} });
    body.push(Buffer.alloc(1000));
    const pending = storage.putObjectStream({
      key,
      body,
      contentType: 'image/jpeg',
      signal: controller.signal,
    });
    controller.abort();
    body.destroy();
    await expect(pending).rejects.toBeDefined();
    await expect(storage.headObject(key)).resolves.toBeNull();
  });

  it('headObject e deleteObject', async () => {
    const { key, body } = await putSample();
    await expect(storage.headObject(key)).resolves.toEqual({
      size: body.length,
      contentType: 'application/pdf',
    });
    await storage.deleteObject(key);
    await expect(storage.headObject(key)).resolves.toBeNull();
  });
});
