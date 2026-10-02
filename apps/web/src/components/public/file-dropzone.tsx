'use client';

import { FILE_INPUT_ACCEPT, SUBMISSION_MESSAGES } from '@receita/shared';
import { Camera, FolderOpen, Upload } from 'lucide-react';
import { type DragEvent, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cx } from '@/lib/cx';

/**
 * Área de upload (DESIGN §6.4): toque/clique amplo, arrastar e soltar no desktop,
 * galeria/arquivos e câmera (capture) em dispositivos compatíveis.
 */
export function FileDropzone({
  onFiles,
  disabled,
  limitReached,
  describedBy,
}: {
  onFiles: (files: File[]) => void;
  disabled: boolean;
  limitReached: boolean;
  describedBy: string;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const titleId = useId();
  const inactive = disabled || limitReached;

  useEffect(() => {
    // Câmera direta apenas em dispositivos de toque (DESIGN §6.3).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasCamera(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  function take(list: FileList | null) {
    if (list && list.length > 0) onFiles(Array.from(list));
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    if (!inactive) take(event.dataTransfer.files);
  }

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      aria-disabled={inactive || undefined}
      onDragOver={(event) => {
        event.preventDefault();
        if (!inactive) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cx(
        'flex flex-col items-center gap-3 rounded-card border-2 border-dashed px-4 py-8 text-center transition-colors',
        inactive
          ? 'border-line bg-disabled text-disabled-content'
          : dragOver
            ? 'border-primary bg-selected'
            : 'border-line-strong bg-surface',
      )}
    >
      <Upload className="size-10 text-content-muted" aria-hidden />
      <p id={titleId} className="text-body font-medium">
        {limitReached ? SUBMISSION_MESSAGES.tooManyFiles : 'Arraste os arquivos ou'}
      </p>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button
          disabled={inactive}
          onClick={() => pickerRef.current?.click()}
          className="w-full sm:w-auto"
        >
          <FolderOpen className="size-4" aria-hidden />
          {SUBMISSION_MESSAGES.chooseFiles}
        </Button>
        {hasCamera ? (
          <Button
            variant="secondary"
            disabled={inactive}
            onClick={() => cameraRef.current?.click()}
            className="w-full sm:w-auto"
          >
            <Camera className="size-4" aria-hidden />
            {SUBMISSION_MESSAGES.takePhoto}
          </Button>
        ) : null}
      </div>
      <input
        ref={pickerRef}
        type="file"
        multiple
        accept={FILE_INPUT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="file-input"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          take(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
