import { EXTENSION_MIME_TYPES, fileExtension, isAllowedExtension } from '@receita/shared';
import { fileTypeFromBuffer } from 'file-type';

/** Bytes suficientes para a detecção por assinatura (file-type recomenda 4100). */
export const DETECTION_BYTES = 4100;

export type FileRejection =
  'extension_not_allowed' | 'content_not_allowed' | 'content_mismatch' | 'empty';

export type FileCheck = { ok: true; mimeType: string } | { ok: false; reason: FileRejection };

/**
 * Validação por extensão E pelo tipo real detectado nos magic bytes (PRD §9.4).
 * O MIME declarado pelo cliente é ignorado. Extensão e conteúdo precisam concordar
 * (ex.: um executável renomeado para .jpg é rejeitado).
 */
export async function checkFile(filename: string, head: Uint8Array): Promise<FileCheck> {
  const extension = fileExtension(filename);
  if (!isAllowedExtension(extension)) return { ok: false, reason: 'extension_not_allowed' };
  if (head.length === 0) return { ok: false, reason: 'empty' };

  const detected = await fileTypeFromBuffer(head);
  if (!detected) return { ok: false, reason: 'content_not_allowed' };

  const allowedForExtension: readonly string[] = EXTENSION_MIME_TYPES[extension];
  const allAllowed = Object.values(EXTENSION_MIME_TYPES).flat() as readonly string[];
  if (!allAllowed.includes(detected.mime)) return { ok: false, reason: 'content_not_allowed' };
  if (!allowedForExtension.includes(detected.mime))
    return { ok: false, reason: 'content_mismatch' };
  return { ok: true, mimeType: detected.mime };
}
