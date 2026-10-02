import { AuditAction } from '@receita/shared';
import { buildTimeline } from './timeline.js';

const t = (minute: number) => new Date(Date.UTC(2026, 9, 1, 14, minute));

describe('buildTimeline', () => {
  const base = {
    receivedAt: t(22),
    statusHistory: [
      {
        id: 's1',
        createdAt: t(22),
        fromStatus: null,
        toStatus: 'RECEIVED' as const,
        actorName: null,
      },
      {
        id: 's2',
        createdAt: t(25),
        fromStatus: 'RECEIVED' as const,
        toStatus: 'IN_REVIEW' as const,
        actorName: 'Ana',
      },
    ],
    patientLinks: [{ id: 'p1', createdAt: t(22), linkType: 'PERSONALIZED_LINK', actorName: null }],
    fileIds: ['f1', 'f2'],
    audits: [
      {
        id: 'a1',
        createdAt: t(23),
        action: AuditAction.PRESCRIPTION_FIRST_VIEWED,
        entityId: 'sub',
        actorName: 'Ana',
        metadata: null,
      },
      {
        id: 'a2',
        createdAt: t(24),
        action: AuditAction.PRESCRIPTION_FILE_VIEWED,
        entityId: 'f2',
        actorName: 'Ana',
        metadata: { variant: 'preview', submissionId: 'sub' },
      },
      {
        id: 'a3',
        createdAt: t(24),
        action: AuditAction.PRESCRIPTION_FILE_VIEWED,
        entityId: 'f1',
        actorName: 'Ana',
        metadata: { variant: 'thumbnail' },
      },
      {
        id: 'a4',
        createdAt: t(26),
        action: AuditAction.PRESCRIPTION_FILE_DOWNLOADED,
        entityId: 'f1',
        actorName: 'Bia',
        metadata: {},
      },
      {
        id: 'a5',
        createdAt: t(27),
        action: AuditAction.PRESCRIPTION_OPENED,
        entityId: 'sub',
        actorName: 'Bia',
        metadata: null,
      },
      {
        id: 'a6',
        createdAt: t(28),
        action: AuditAction.PRESCRIPTION_CPF_REVEALED,
        entityId: 'sub',
        actorName: 'Bia',
        metadata: null,
      },
    ],
  };

  it('monta a sequência em ordem cronológica com os responsáveis', () => {
    expect(buildTimeline(base).map((e) => [e.type, e.actorName])).toEqual([
      ['patient_linked', null],
      ['received', null],
      ['first_viewed', 'Ana'],
      ['file_viewed', 'Ana'],
      ['status_changed', 'Ana'],
      ['file_downloaded', 'Bia'],
      ['cpf_revealed', 'Bia'],
    ]);
  });

  it('identifica anexos pela posição e omite miniaturas e aberturas comuns', () => {
    const timeline = buildTimeline(base);
    expect(timeline.find((e) => e.id === 'a2')?.filePosition).toBe(2);
    expect(timeline.find((e) => e.id === 'a4')?.filePosition).toBe(1);
    expect(timeline.some((e) => e.id === 'a3' || e.id === 'a5')).toBe(false);
  });

  it('marca reabertura de estado final', () => {
    const timeline = buildTimeline({
      ...base,
      statusHistory: [
        ...base.statusHistory,
        {
          id: 's3',
          createdAt: t(30),
          fromStatus: 'FINISHED',
          toStatus: 'IN_REVIEW',
          actorName: 'Gestor',
        },
      ],
    });
    expect(timeline.at(-1)).toMatchObject({
      type: 'reopened',
      fromStatus: 'FINISHED',
      toStatus: 'IN_REVIEW',
    });
  });

  it('nunca expõe IP, metadados técnicos ou nomes de arquivo', () => {
    const serialized = JSON.stringify(buildTimeline(base));
    expect(serialized).not.toMatch(/variant|submissionId|ip|receita-\d/);
  });

  it('inclui "recebida" mesmo sem histórico inicial', () => {
    const timeline = buildTimeline({ ...base, statusHistory: [] });
    expect(timeline.some((e) => e.type === 'received')).toBe(true);
  });
});
