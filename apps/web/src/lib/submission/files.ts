import { clientFileError, fileExtension, MAX_FILES, SUBMISSION_MESSAGES } from '@receita/shared';

export type FileKind = 'image' | 'heic' | 'pdf';

export interface SelectedFile {
  id: string;
  file: File;
  kind: FileKind;
  /** Erro devolvido pelo servidor para este arquivo (o cliente só aceita válidos). */
  error?: string;
}

export interface RejectedFile {
  name: string;
  message: string;
}

export function fileKind(name: string): FileKind {
  const extension = fileExtension(name);
  if (extension === 'pdf') return 'pdf';
  if (extension === 'heic' || extension === 'heif') return 'heic';
  return 'image';
}

let sequence = 0;
const nextId = (): string => {
  sequence += 1;
  return `f${Date.now()}-${sequence}`;
};

/**
 * Adiciona arquivos validando formato, tamanho e limite (PRD §9.2). Arquivos
 * inválidos não entram na lista — nunca chegam ao backend — e voltam com o motivo.
 */
export function addFiles(
  current: SelectedFile[],
  incoming: File[],
): { files: SelectedFile[]; rejected: RejectedFile[] } {
  const files = [...current];
  const rejected: RejectedFile[] = [];
  for (const file of incoming) {
    const error = clientFileError(file);
    if (error) {
      rejected.push({ name: file.name, message: error });
      continue;
    }
    if (files.length >= MAX_FILES) {
      rejected.push({ name: file.name, message: SUBMISSION_MESSAGES.tooManyFiles });
      continue;
    }
    files.push({ id: nextId(), file, kind: fileKind(file.name) });
  }
  return { files, rejected };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
