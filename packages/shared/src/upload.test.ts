import { describe, expect, it } from 'vitest';
import {
  clientFileError,
  fileExtension,
  MAX_FILE_BYTES,
  sanitizeOriginalFilename,
  SUBMISSION_MESSAGES,
} from './upload.js';

describe('clientFileError', () => {
  it.each(['receita.jpg', 'RECEITA.JPEG', 'a.png', 'foto.heic', 'foto.HEIF', 'doc.pdf'])(
    'aceita %s',
    (name) => {
      expect(clientFileError({ name, size: 1000 })).toBeNull();
    },
  );

  it.each(['virus.exe', 'imagem.gif', 'sem-extensao', 'planilha.xlsx', 'receita.jpg.exe'])(
    'rejeita %s',
    (name) => {
      expect(clientFileError({ name, size: 1000 })).toBe(SUBMISSION_MESSAGES.invalidFormat);
    },
  );

  it('aceita exatamente 5 MB e rejeita 5 MB + 1 byte', () => {
    expect(clientFileError({ name: 'a.jpg', size: MAX_FILE_BYTES })).toBeNull();
    expect(clientFileError({ name: 'a.jpg', size: MAX_FILE_BYTES + 1 })).toBe(
      SUBMISSION_MESSAGES.fileTooLarge,
    );
  });

  it('rejeita arquivo vazio', () => {
    expect(clientFileError({ name: 'a.jpg', size: 0 })).not.toBeNull();
  });
});

describe('fileExtension / sanitizeOriginalFilename', () => {
  it('extrai a última extensão em minúsculas', () => {
    expect(fileExtension('a.b.PDF')).toBe('pdf');
    expect(fileExtension('semponto')).toBe('');
  });

  it('remove caminho e caracteres de controle', () => {
    expect(sanitizeOriginalFilename('C:\\fotos\\..\\receita\u0000.jpg')).toBe('receita.jpg');
    expect(sanitizeOriginalFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeOriginalFilename('\u0007')).toBe('arquivo');
    expect(sanitizeOriginalFilename(`${'a'.repeat(300)}.pdf`)).toHaveLength(255);
  });
});
