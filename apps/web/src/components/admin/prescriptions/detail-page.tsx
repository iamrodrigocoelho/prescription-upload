'use client';

import { SOURCE_CHANNEL_LABELS, type RealtimeEvent } from '@receita/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Eye } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, PageHeader } from '@/components/ui/card';
import { Spinner } from '@/components/ui/feedback';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { track } from '@/lib/analytics';
import { formatDateTime } from '@/lib/format';
import { formatFileSize } from '@/lib/submission/files';
import { usePrescription } from '@/lib/prescriptions';
import { useRealtime } from '@/lib/realtime';
import { IdentificationBadge } from './badges';
import { CpfReveal } from './cpf-reveal';
import { downloadFile, FileViewer } from './file-viewer';
import { FileThumb } from './file-thumb';
import { StatusControl } from './status-control';
import { Timeline } from './timeline';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-h3 font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

/** Detalhe (DESIGN §8.4, §13.6): metadados → paciente → status → arquivos → histórico. */
export function DetailPage({ id }: { id: string }) {
  const detail = usePrescription(id);
  const client = useQueryClient();
  const notify = useToast();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Devolve o foco ao botão que abriu o visualizador (WCAG 2.4.3).
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // Após o commit que desmonta o visualizador (fora da armadilha de foco do diálogo).
    if (viewerIndex === null && returnFocus.current) {
      const target = returnFocus.current;
      returnFocus.current = null;
      // Próximo ciclo: o diálogo libera o restante da página (inert/aria-hidden) na limpeza.
      const timer = setTimeout(() => target.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [viewerIndex]);

  useEffect(() => {
    if (detail.data) track('prescription_opened', {});
    // Somente na primeira carga do detalhe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data?.id]);

  const onEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.type === 'prescription.status_changed' && event.prescriptionId === id) {
        if (detail.data && event.version > detail.data.version) {
          notify('O status desta receita foi atualizado.');
          void client.invalidateQueries({ queryKey: ['prescriptions', 'detail', id] });
        }
      }
    },
    [client, detail.data, id, notify],
  );
  useRealtime(onEvent);

  if (detail.isLoading) return <Spinner />;
  if (detail.error || !detail.data) {
    return (
      <Alert tone="error" title={errorMessage(detail.error)}>
        <Link href="/admin/receitas" className="underline">
          Voltar para a fila
        </Link>
      </Alert>
    );
  }
  const data = detail.data;

  return (
    <>
      <PageHeader
        title={`Receita · Loja ${data.store.storeNumber}`}
        description={`${data.store.storeName} · Recebida em ${formatDateTime(data.receivedAt)}`}
        actions={
          <Link
            href="/admin/receitas"
            className="inline-flex min-h-11 items-center px-3 text-link underline"
          >
            Voltar para a fila
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <Section title="Dados do envio">
            <dl className="grid gap-3 text-body-sm sm:grid-cols-2">
              <div>
                <dt className="text-content-muted">Loja</dt>
                <dd>
                  {data.store.storeNumber} · {data.store.storeName}
                </dd>
              </div>
              <div>
                <dt className="text-content-muted">Recebida em</dt>
                <dd>{formatDateTime(data.receivedAt)}</dd>
              </div>
              <div>
                <dt className="text-content-muted">Origem</dt>
                <dd>{SOURCE_CHANNEL_LABELS[data.sourceChannel]}</dd>
              </div>
              <div>
                <dt className="text-content-muted">CPF informado</dt>
                <dd>
                  {data.cpfMasked ? (
                    <CpfReveal prescriptionId={data.id} masked={data.cpfMasked} />
                  ) : (
                    'Não informado'
                  )}
                </dd>
              </div>
            </dl>
          </Section>

          <Section title="Paciente">
            <div className="flex flex-col gap-2 text-body-sm">
              <IdentificationBadge status={data.identificationStatus} />
              <p>{data.patientLabel ?? 'Nenhum paciente vinculado.'}</p>
              {/* Espaço reservado para "Vincular paciente" (Fase 4). */}
              <div className="min-h-2" data-slot="vincular-paciente" />
            </div>
          </Section>

          <Section title="Status">
            <StatusControl detail={data} />
          </Section>

          <Section title="Arquivos">
            <ul className="flex flex-col gap-2">
              {data.files.map((file, index) => (
                <li
                  key={file.id}
                  className="flex flex-wrap items-center gap-3 rounded-card border border-line p-2"
                >
                  <FileThumb prescriptionId={data.id} file={file} />
                  <div className="min-w-32 flex-1 text-body-sm">
                    <p className="font-medium">
                      Arquivo {file.position} · {file.kind === 'pdf' ? 'PDF' : 'Imagem'}
                    </p>
                    <p className="text-caption text-content-muted">
                      {formatFileSize(file.sizeBytes)}
                    </p>
                    {file.malwareScanStatus === 'PENDING' ? (
                      <StatusBadge tone="neutral" label="Verificação pendente" />
                    ) : null}
                    {!file.accessible ? (
                      <StatusBadge tone="error" label="Bloqueado pela verificação" />
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!file.accessible}
                      onClick={(event) => {
                        returnFocus.current = event.currentTarget;
                        setViewerIndex(index);
                      }}
                    >
                      <Eye className="size-4" aria-hidden />
                      Visualizar
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!file.accessible}
                      onClick={() =>
                        void downloadFile(data.id, file).catch((e: unknown) =>
                          notify(errorMessage(e), 'error'),
                        )
                      }
                    >
                      <Download className="size-4" aria-hidden />
                      Baixar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Section title="Histórico">
          <Timeline entries={data.timeline} />
        </Section>
      </div>

      {viewerIndex !== null ? (
        <FileViewer
          prescriptionId={data.id}
          files={data.files}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => {
            setViewerIndex(null);
            void client.invalidateQueries({ queryKey: ['prescriptions', 'detail', id] });
          }}
        />
      ) : null}
    </>
  );
}
