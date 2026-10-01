import { MAX_IMPORT_ROWS, parseStoresCsv } from './store-csv.parser.js';

describe('parseStoresCsv', () => {
  it('aceita CSV com vírgula e todos os campos', () => {
    const result = parseStoresCsv(
      'store_number,store_name,active,address,neighborhood,city,state\n' +
        '101,Venancio Copacabana,true,Rua X 1,Copacabana,Rio de Janeiro,rj\n',
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        line: 2,
        storeNumber: '101',
        storeName: 'Venancio Copacabana',
        active: true,
        address: 'Rua X 1',
        neighborhood: 'Copacabana',
        city: 'Rio de Janeiro',
        state: 'RJ',
      },
    ]);
  });

  it('aceita ponto e vírgula, BOM, cabeçalho em maiúsculas e colunas opcionais ausentes', () => {
    const result = parseStoresCsv('﻿STORE_NUMBER;Store_Name;ACTIVE\n102;Tijuca;não\n103;Barra;1\n');
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => [r.storeNumber, r.active, r.state])).toEqual([
      ['102', false, null],
      ['103', true, null],
    ]);
  });

  it('preserva vírgulas em valores de arquivos separados por ponto e vírgula', () => {
    const result = parseStoresCsv(
      'store_number;store_name;active;address\n101;Copacabana;sim;Rua A, 1\n',
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.address).toBe('Rua A, 1');
  });

  it('reporta linhas inválidas com número da linha e campo, sem descartar as válidas', () => {
    const result = parseStoresCsv(
      'store_number,store_name,active,state\n' +
        '101,Loja OK,true,RJ\n' +
        ',Sem número,true,\n' +
        '104,X,talvez,ZZ\n' +
        '105,=HYPERLINK("http://x"),true,\n',
    );
    expect(result.rows.map((r) => r.storeNumber)).toEqual(['101']);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 3, field: 'store_number' }),
        expect.objectContaining({ line: 4, field: 'store_name' }),
        expect.objectContaining({ line: 4, field: 'active' }),
        expect.objectContaining({ line: 4, field: 'state' }),
        expect.objectContaining({ line: 5, field: 'store_name' }),
      ]),
    );
    expect(result.totalRows).toBe(4);
  });

  it('detecta store_number duplicado no próprio arquivo', () => {
    const result = parseStoresCsv(
      'store_number,store_name,active\n101,Loja A,true\n101,Loja B,true\n',
    );
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([
      { line: 3, field: 'store_number', message: expect.stringContaining('linha 2') },
    ]);
  });

  it('exige as colunas obrigatórias', () => {
    const result = parseStoresCsv('store_number,name\n101,A\n');
    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.message).toContain('store_name');
    expect(result.errors[0]?.message).toContain('active');
  });

  it('rejeita arquivo vazio e acima do limite de linhas', () => {
    expect(parseStoresCsv('').errors[0]?.message).toBe('Arquivo vazio.');
    const big = 'store_number,store_name,active\n' + '1,A,true\n'.repeat(MAX_IMPORT_ROWS + 1);
    expect(parseStoresCsv(big).errors[0]?.message).toContain('limite');
  });

  it('rejeita CSV malformado', () => {
    expect(
      parseStoresCsv('store_number,store_name,active\n"101,A,true\n').errors[0]?.message,
    ).toContain('inválido');
  });
});
