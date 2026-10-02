'use client';

import type { PrescriptionFileView, SignedFileUrl } from '@receita/shared';
import { ChevronLeft, ChevronRight, Download, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog } from 'radix-ui';
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { track } from '@/lib/analytics';

export async function downloadFile(
  prescriptionId: string,
  file: PrescriptionFileView,
): Promise<void> {
  const { url } = await api<SignedFileUrl>(
    `/prescriptions/${prescriptionId}/files/${file.id}/download-url`,
  );
  track('prescription_file_downloaded', { fileKind: file.kind });
  // URL assinada com Content-Disposition: attachment — o navegador baixa sem sair da página.
  window.location.assign(url);
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;

/**
 * Visualizador de anexos (DESIGN §8.4): imagens com zoom, arraste e rotação
 * (usa o derivado JPEG para HEIC), PDF no visualizador nativo, fallback de
 * download, navegação entre anexos e operação completa por teclado.
 */
export function FileViewer({
  prescriptionId,
  files,
  index,
  onIndexChange,
  onClose,
}: {
  prescriptionId: string;
  files: PrescriptionFileView[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const file = files[index];
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const reset = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- troca de anexo reinicia o estado do visualizador
    setUrl(null);
    setError(null);
    reset();
    const variant = file.kind === 'image' && file.previewAvailable ? 'preview' : 'original';
    api<SignedFileUrl>(
      `/prescriptions/${prescriptionId}/files/${file.id}/view-url?variant=${variant}`,
    )
      .then((result) => {
        if (cancelled) return;
        setUrl(result.url);
        track('prescription_file_viewed', { fileKind: file.kind });
      })
      .catch((e: unknown) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [file, prescriptionId, reset]);

  if (!file) return null;
  const isImage = file.kind === 'image';
  const canPreview = file.accessible && (file.kind === 'pdf' || file.previewAvailable);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'PageDown' && index < files.length - 1) onIndexChange(index + 1);
    else if (event.key === 'PageUp' && index > 0) onIndexChange(index - 1);
    else if (!isImage) return;
    else if (event.key === '+' || event.key === '=') setZoom((z) => Math.min(MAX_ZOOM, z + 0.25));
    else if (event.key === '-') setZoom((z) => Math.max(MIN_ZOOM, z - 0.25));
    else if (event.key.toLowerCase() === 'r') setRotation((r) => (r + 90) % 360);
    else if (event.key === '0') reset();
    else if (event.key.startsWith('Arrow')) {
      const step = 40;
      const dx = event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0;
      const dy = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
      setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
    } else return;
    event.preventDefault();
  }

  const onPointerDown = (event: PointerEvent) => {
    drag.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (drag.current)
      setOffset({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y });
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-content/80" />
        <Dialog.Content
          onKeyDown={onKeyDown}
          // O foco é devolvido explicitamente por quem abriu (não há Dialog.Trigger).
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-modal bg-surface shadow-overlay sm:inset-6"
          aria-describedby="viewer-help"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
            <Dialog.Title className="mr-auto px-2 text-body font-semibold">
              Arquivo {file.position} de {files.length}
            </Dialog.Title>
            <Button
              variant="secondary"
              size="sm"
              disabled={index === 0}
              onClick={() => onIndexChange(index - 1)}
              aria-label="Anexo anterior"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={index >= files.length - 1}
              onClick={() => onIndexChange(index + 1)}
              aria-label="Próximo anexo"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            {isImage && canPreview ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.25))}
                  aria-label="Diminuir zoom"
                >
                  <ZoomOut className="size-4" aria-hidden />
                </Button>
                <span className="w-12 text-center text-caption" aria-live="polite">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.25))}
                  aria-label="Aumentar zoom"
                >
                  <ZoomIn className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  aria-label="Girar 90 graus"
                >
                  <RotateCw className="size-4" aria-hidden />
                </Button>
              </>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              disabled={!file.accessible}
              onClick={() => void downloadFile(prescriptionId, file)}
            >
              <Download className="size-4" aria-hidden />
              Baixar
            </Button>
            <Dialog.Close asChild>
              <Button variant="tertiary" size="sm" aria-label="Fechar visualizador">
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <p id="viewer-help" className="sr-only">
            Use Page Up e Page Down para trocar de anexo. Em imagens: mais e menos para zoom, R para
            girar, setas para mover e 0 para restaurar.
          </p>
          <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-subtle">
            {!file.accessible ? (
              <Alert
                tone="error"
                title="Este arquivo foi bloqueado pela verificação de segurança."
              />
            ) : !canPreview ? (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <p className="text-body-sm">
                  A pré-visualização deste arquivo não está disponível.
                </p>
                <Button onClick={() => void downloadFile(prescriptionId, file)}>
                  <Download className="size-4" aria-hidden />
                  Baixar arquivo
                </Button>
              </div>
            ) : error ? (
              <Alert tone="error" title={error} />
            ) : !url ? (
              <p role="status" className="text-body-sm text-content-muted">
                Carregando…
              </p>
            ) : isImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage privado
              <img
                src={url}
                alt={`Arquivo ${file.position} da receita`}
                draggable={false}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => (drag.current = null)}
                onError={() => setError('Não foi possível exibir a imagem. Use o download.')}
                className="max-h-full max-w-full cursor-grab touch-none select-none active:cursor-grabbing"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                }}
                data-testid="viewer-image"
                data-zoom={zoom}
                data-rotation={rotation}
              />
            ) : (
              <iframe
                src={url}
                title={`Arquivo ${file.position} da receita (PDF)`}
                className="size-full border-0 bg-surface"
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
