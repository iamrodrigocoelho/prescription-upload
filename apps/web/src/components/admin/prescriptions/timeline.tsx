import { OPERATIONAL_STATUS_LABELS, type TimelineEntry } from '@receita/shared';
import { formatDateTime } from '@/lib/format';

function describe(entry: TimelineEntry): string {
  const file = entry.filePosition ? `arquivo ${entry.filePosition}` : 'arquivo';
  switch (entry.type) {
    case 'received':
      return 'Receita recebida';
    case 'first_viewed':
      return 'Primeira visualização';
    case 'file_viewed':
      return `Visualizou o ${file}`;
    case 'file_downloaded':
      return `Baixou o ${file}`;
    case 'status_changed':
      return `Status: ${entry.fromStatus ? OPERATIONAL_STATUS_LABELS[entry.fromStatus] : '—'} → ${entry.toStatus ? OPERATIONAL_STATUS_LABELS[entry.toStatus] : '—'}`;
    case 'reopened':
      return `Reaberta: ${entry.fromStatus ? OPERATIONAL_STATUS_LABELS[entry.fromStatus] : '—'} → ${entry.toStatus ? OPERATIONAL_STATUS_LABELS[entry.toStatus] : '—'}`;
    case 'patient_linked':
      return entry.linkType === 'PERSONALIZED_LINK'
        ? 'Paciente vinculado pelo link personalizado'
        : entry.linkType === 'AUTOMATIC_CPF'
          ? 'Paciente identificado automaticamente pelo CPF'
          : 'Paciente vinculado manualmente';
    case 'cpf_revealed':
      return 'CPF completo exibido';
    default:
      return 'Evento';
  }
}

/** Histórico em timeline (DESIGN §10.5, §13.6). */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="flex flex-col gap-3 border-l-2 border-line pl-4">
      {entries.map((entry) => (
        <li key={entry.id} className="relative text-body-sm">
          <span
            className="absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full bg-line-strong"
            aria-hidden
          />
          <time className="block text-caption text-content-muted" dateTime={entry.at}>
            {formatDateTime(entry.at)}
          </time>
          <span className="text-content">{describe(entry)}</span>
          {entry.actorName ? (
            <span className="text-content-secondary"> — {entry.actorName}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
