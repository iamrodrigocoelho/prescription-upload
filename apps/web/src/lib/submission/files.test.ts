import { MAX_FILE_BYTES } from '@receita/shared';
import { describe, expect, it } from 'vitest';
import { addFiles, fileKind, formatFileSize } from './files';

const make = (name: string, size = 1000): File => new File([new Uint8Array(size)], name);

describe('addFiles', () => {
  it('aceita formatos permitidos e classifica o tipo', () => {
    const { files, rejected } = addFiles([], [make('a.jpg'), make('b.pdf'), make('c.HEIC')]);
    expect(rejected).toEqual([]);
    expect(files.map((f) => f.kind)).toEqual(['image', 'pdf', 'heic']);
  });

  it('CA-004: rejeita arquivo acima de 5 MB com a mensagem do DESIGN', () => {
    const { files, rejected } = addFiles([], [make('grande.jpg', MAX_FILE_BYTES + 1)]);
    expect(files).toEqual([]);
    expect(rejected).toEqual([
      { name: 'grande.jpg', message: 'Este arquivo ultrapassa o limite de 5 MB.' },
    ]);
  });

  it('rejeita formato não permitido', () => {
    expect(addFiles([], [make('a.gif')]).rejected[0]?.message).toBe(
      'Formato de arquivo não permitido.',
    );
  });

  it('CA-005: com 10 arquivos, impede a inclusão de outro e informa o limite', () => {
    const ten = addFiles(
      [],
      Array.from({ length: 10 }, (_, i) => make(`r${i}.jpg`)),
    ).files;
    const { files, rejected } = addFiles(ten, [make('extra.jpg')]);
    expect(files).toHaveLength(10);
    expect(rejected).toEqual([
      { name: 'extra.jpg', message: 'Você pode enviar no máximo 10 arquivos.' },
    ]);
  });

  it('não muta a lista atual', () => {
    const current = addFiles([], [make('a.jpg')]).files;
    addFiles(current, [make('b.jpg')]);
    expect(current).toHaveLength(1);
  });
});

describe('fileKind / formatFileSize', () => {
  it('classifica pela extensão', () => {
    expect(fileKind('x.heif')).toBe('heic');
    expect(fileKind('x.png')).toBe('image');
  });

  it('formata em pt-BR', () => {
    expect(formatFileSize(2.1 * 1024 * 1024)).toBe('2,1 MB');
    expect(formatFileSize(500 * 1024)).toBe('500 KB');
    expect(formatFileSize(10)).toBe('1 KB');
  });
});
