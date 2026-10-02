import { prescriptionFilterWhere } from './prescription-filters.js';

const SCOPE = { storeId: { in: ['loja-a'] } };

describe('prescriptionFilterWhere', () => {
  it('sempre inclui o escopo como primeira condição AND', () => {
    expect(prescriptionFilterWhere(SCOPE, {})).toEqual({ AND: [SCOPE] });
  });

  it('storeId de outra loja é combinado com AND — nunca substitui o escopo', () => {
    const where = prescriptionFilterWhere(SCOPE, { storeId: 'loja-b' });
    expect(where).toEqual({ AND: [SCOPE, { storeId: 'loja-b' }] });
  });

  it('Admin (escopo vazio) com filtro de loja', () => {
    expect(prescriptionFilterWhere({}, { storeId: 'loja-b' })).toEqual({
      AND: [{}, { storeId: 'loja-b' }],
    });
  });

  it('traduz período, status, identificação, origem, CPF, novas e vínculo', () => {
    const where = prescriptionFilterWhere(SCOPE, {
      from: '2026-10-01T00:00:00Z',
      to: '2026-10-02T00:00:00Z',
      operationalStatus: ['RECEIVED'],
      identificationStatus: ['NOT_IDENTIFIED'],
      sourceChannel: ['STORE_LINK'],
      hasCpf: true,
      unviewed: true,
      linked: false,
    });
    expect(where.AND).toEqual([
      SCOPE,
      {
        createdAt: { gte: new Date('2026-10-01T00:00:00Z'), lte: new Date('2026-10-02T00:00:00Z') },
      },
      { operationalStatus: { in: ['RECEIVED'] } },
      { identificationStatus: { in: ['NOT_IDENTIFIED'] } },
      { sourceChannel: { in: ['STORE_LINK'] } },
      { cpfHashForLookup: { not: null } },
      { firstViewedAt: null },
      { patientExternalId: null },
    ]);
  });

  it('negações: sem CPF, já visualizadas, com paciente', () => {
    const where = prescriptionFilterWhere(SCOPE, { hasCpf: false, unviewed: false, linked: true });
    expect(where.AND).toEqual([
      SCOPE,
      { cpfHashForLookup: null },
      { firstViewedAt: { not: null } },
      { patientExternalId: { not: null } },
    ]);
  });
});
