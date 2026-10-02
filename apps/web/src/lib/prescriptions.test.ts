import { describe, expect, it } from 'vitest';
import { filtersFromParams, filtersToQuery } from './prescriptions';

describe('filtros da fila na URL', () => {
  it('lê apenas chaves conhecidas', () => {
    const params = new URLSearchParams('operationalStatus=RECEIVED&unviewed=true&malicioso=1');
    expect(filtersFromParams(params)).toEqual({ operationalStatus: 'RECEIVED', unviewed: 'true' });
  });

  it('serializa em ordem estável e omite vazios', () => {
    expect(filtersToQuery({ unviewed: 'true', storeId: 'abc', from: '' })).toBe(
      'storeId=abc&unviewed=true',
    );
  });
});
