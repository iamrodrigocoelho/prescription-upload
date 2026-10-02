import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { buildDerivatives, derivativeKeys } from './derivatives.js';

const heic = readFileSync(
  resolve(import.meta.dirname, '../../../test/fixtures/amostra-sintetica.heic'),
);

describe('buildDerivatives', () => {
  it('HEIC gera preview JPEG e miniatura', async () => {
    const result = await buildDerivatives(heic, 'image/heic');
    const preview = await sharp(result.preview).metadata();
    const thumb = await sharp(result.thumbnail).metadata();
    expect(preview).toMatchObject({ format: 'jpeg', width: 640, height: 480 });
    expect(thumb.format).toBe('jpeg');
    expect(Math.max(thumb.width ?? 0, thumb.height ?? 0)).toBeLessThanOrEqual(320);
  });

  it('JPEG gera só miniatura (o original já é visualizável) e remove EXIF', async () => {
    const jpeg = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#cccccc' },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Artist: 'paciente' } } })
      .toBuffer();
    const result = await buildDerivatives(jpeg, 'image/jpeg');
    expect(result.preview).toBeUndefined();
    const meta = await sharp(result.thumbnail).metadata();
    expect(meta.width).toBe(320);
    expect(meta.exif).toBeUndefined();
  });

  it('PDF não gera derivados', async () => {
    await expect(buildDerivatives(Buffer.from('%PDF-1.7'), 'application/pdf')).resolves.toEqual({});
  });

  it('conteúdo corrompido falha (para retry/registro de falha)', async () => {
    await expect(buildDerivatives(Buffer.from('lixo'), 'image/jpeg')).rejects.toThrow();
  });

  it('chaves determinísticas por arquivo', () => {
    expect(derivativeKeys('abc')).toEqual({
      preview: 'derivatives/abc/preview.jpg',
      thumbnail: 'derivatives/abc/thumbnail.jpg',
    });
  });
});
