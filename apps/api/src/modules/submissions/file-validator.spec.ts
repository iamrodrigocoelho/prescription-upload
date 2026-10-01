import { EXE, HEIC, JPEG, PDF, PNG, TEXT } from '../../../test/fixtures/files.js';
import { checkFile } from './file-validator.js';

describe('checkFile (magic bytes)', () => {
  it.each([
    ['receita.jpg', JPEG(), 'image/jpeg'],
    ['receita.JPEG', JPEG(), 'image/jpeg'],
    ['foto.png', PNG(), 'image/png'],
    ['documento.pdf', PDF(), 'application/pdf'],
    ['foto.heic', HEIC(), 'image/heic'],
    ['foto.heif', HEIC(), 'image/heic'],
  ])('aceita %s', async (name, content, mime) => {
    await expect(checkFile(name, content)).resolves.toEqual({ ok: true, mimeType: mime });
  });

  it('rejeita executável renomeado para .jpg', async () => {
    await expect(checkFile('receita.jpg', EXE())).resolves.toEqual({
      ok: false,
      reason: 'content_not_allowed',
    });
  });

  it('rejeita divergência entre extensão e conteúdo', async () => {
    await expect(checkFile('receita.jpg', PNG())).resolves.toEqual({
      ok: false,
      reason: 'content_mismatch',
    });
    await expect(checkFile('receita.pdf', JPEG())).resolves.toEqual({
      ok: false,
      reason: 'content_mismatch',
    });
  });

  it('rejeita extensão fora da allowlist, mesmo com conteúdo válido', async () => {
    await expect(checkFile('receita.gif', JPEG())).resolves.toEqual({
      ok: false,
      reason: 'extension_not_allowed',
    });
    await expect(checkFile('receita', JPEG())).resolves.toEqual({
      ok: false,
      reason: 'extension_not_allowed',
    });
  });

  it('rejeita conteúdo sem assinatura reconhecida e arquivo vazio', async () => {
    await expect(checkFile('receita.pdf', TEXT())).resolves.toEqual({
      ok: false,
      reason: 'content_not_allowed',
    });
    await expect(checkFile('receita.jpg', Buffer.alloc(0))).resolves.toEqual({
      ok: false,
      reason: 'empty',
    });
  });
});
