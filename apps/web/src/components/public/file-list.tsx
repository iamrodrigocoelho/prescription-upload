'use client';

import { AlertCircle, FileImage, FileText, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatFileSize, type SelectedFile } from '@/lib/submission/files';

function Thumbnail({ item }: { item: SelectedFile }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (item.kind === 'pdf') return;
    const objectUrl = URL.createObjectURL(item.file);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl);
    // Libera a memória ao remover o arquivo (object URL revogada).
    return () => URL.revokeObjectURL(objectUrl);
  }, [item]);

  if (item.kind === 'pdf')
    return <FileText className="size-10 shrink-0 text-content-muted" aria-hidden />;
  // HEIC sem suporte de preview no navegador: ícone de tipo como fallback.
  if (!url || failed)
    return <FileImage className="size-10 shrink-0 text-content-muted" aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob local, sem otimização
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className="size-12 shrink-0 rounded-input object-cover"
    />
  );
}

export function FileList({
  files,
  onRemove,
  disabled,
}: {
  files: SelectedFile[];
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  if (files.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label="Arquivos selecionados">
      {files.map((item) => (
        <li
          key={item.id}
          id={`arquivo-${item.id}`}
          tabIndex={item.error ? -1 : undefined}
          className={`flex items-center gap-3 rounded-card border p-2 ${item.error ? 'border-error bg-error-subtle' : 'border-line bg-surface'}`}
        >
          <Thumbnail item={item} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-medium">{item.file.name}</p>
            <p className="text-caption text-content-muted">{formatFileSize(item.file.size)}</p>
            {item.error ? (
              <p className="flex items-center gap-1 text-caption text-error">
                <AlertCircle className="size-3.5" aria-hidden />
                {item.error}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(item.id)}
            className="flex size-11 shrink-0 items-center justify-center rounded-button hover:bg-hover disabled:opacity-50"
            aria-label={`Remover ${item.file.name}`}
          >
            <X className="size-5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
