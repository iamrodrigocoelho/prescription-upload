import type { ApiErrorBody } from '@receita/shared';
import { ApiError } from '@/lib/api';

export interface SendOptions {
  url: string;
  /** Campos de texto — enviados ANTES dos arquivos (exigência da API, D-042). */
  fields: Record<string, string>;
  files: File[];
  idempotencyKey: string;
  onProgress: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Envio multipart via XHR para ter progresso de upload (RNF-005). Nunca loga
 * conteúdo, nomes de arquivo ou CPF.
 */
export function sendSubmission(options: SendOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(options.fields)) form.append(name, value);
    for (const file of options.files) form.append('files', file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', options.url);
    xhr.setRequestHeader('Idempotency-Key', options.idempotencyKey);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        options.onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let body: Partial<ApiErrorBody> | null = null;
      try {
        body = JSON.parse(xhr.responseText) as Partial<ApiErrorBody>;
      } catch {
        body = null;
      }
      const error = body?.error;
      reject(
        new ApiError(
          xhr.status,
          error?.code ?? 'INTERNAL_ERROR',
          error?.message ?? 'Erro inesperado.',
          error?.issues ?? [],
          error?.requestId,
        ),
      );
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', 'Falha de conexão.'));
    xhr.onabort = () => reject(new ApiError(0, 'NETWORK_ERROR', 'Envio cancelado.'));
    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
