/**
 * Conteúdos mínimos com assinaturas reais (magic bytes) para os testes de upload.
 */

const pad = (head: number[], size: number): Buffer => {
  const buffer = Buffer.alloc(Math.max(size, head.length));
  Buffer.from(head).copy(buffer);
  return buffer;
};

export const JPEG = (size = 2048) =>
  pad([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00], size);

export const PNG = (size = 2048) =>
  pad(
    [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52,
    ],
    size,
  );

export const PDF = (size = 2048) => {
  const buffer = Buffer.alloc(size, 0x20);
  Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n').copy(buffer);
  return buffer;
};

/** Caixa ISO-BMFF `ftyp` com brand `heic`. */
export const HEIC = (size = 2048) =>
  pad(
    [
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00,
      0x00, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63,
    ],
    size,
  );

/** Executável Windows (MZ … PE) — usado renomeado para .jpg. */
export const EXE = (size = 2048) => {
  const buffer = pad([0x4d, 0x5a, 0x90, 0x00], size);
  buffer.writeUInt32LE(0x80, 0x3c);
  Buffer.from('PE\0\0').copy(buffer, 0x80);
  return buffer;
};

export const TEXT = (size = 2048) => Buffer.alloc(size, 'a');
