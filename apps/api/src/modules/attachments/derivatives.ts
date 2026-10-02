import decodeHeic from 'heic-decode';
import sharp, { type Sharp } from 'sharp';

export const PREVIEW_MAX_SIDE = 2400;
export const THUMBNAIL_MAX_SIDE = 320;

export interface Derivatives {
  /** JPEG de visualização — gerado apenas para HEIC/HEIF (navegadores não renderizam). */
  preview?: Buffer;
  /** Miniatura JPEG para a fila e o detalhe. */
  thumbnail?: Buffer;
}

/**
 * Derivados de visualização (D-062). HEIC/HEIF: `heic-decode` (libheif em WASM)
 * → `sharp`. Demais imagens: `sharp` com rotação pelo EXIF. Os derivados são
 * re-codificados sem metadados (EXIF/GPS removidos). PDFs não geram derivados.
 */
export async function buildDerivatives(content: Buffer, mimeType: string): Promise<Derivatives> {
  if (mimeType === 'application/pdf') return {};

  let base: Sharp;
  const isHeic = mimeType === 'image/heic' || mimeType === 'image/heif';
  if (isHeic) {
    const decoded = await decodeHeic({ buffer: content });
    base = sharp(
      Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
      {
        raw: { width: decoded.width, height: decoded.height, channels: 4 },
      },
    );
  } else {
    base = sharp(content, { failOn: 'error' }).rotate();
  }

  const thumbnail = await base
    .clone()
    .resize({
      width: THUMBNAIL_MAX_SIDE,
      height: THUMBNAIL_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 70 })
    .toBuffer();
  if (!isHeic) return { thumbnail };

  const preview = await base
    .clone()
    .resize({
      width: PREVIEW_MAX_SIDE,
      height: PREVIEW_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return { preview, thumbnail };
}

/** Chaves determinísticas por arquivo: reprocessar sobrescreve, sem gerar órfãos. */
export function derivativeKeys(fileId: string): { preview: string; thumbnail: string } {
  return {
    preview: `derivatives/${fileId}/preview.jpg`,
    thumbnail: `derivatives/${fileId}/thumbnail.jpg`,
  };
}
