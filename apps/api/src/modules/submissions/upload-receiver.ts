import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import {
  ApiErrorCode,
  MAX_FILE_BYTES,
  MAX_FILES,
  sanitizeOriginalFilename,
  SUBMISSION_MESSAGES,
} from '@receita/shared';
import busboy from 'busboy';
import { AppError } from '../../common/errors.js';
import { generateStorageKey } from '../../infra/storage/storage-key.js';
import type { StorageProvider } from '../../infra/storage/storage.provider.js';
import { checkFile, DETECTION_BYTES, type FileRejection } from './file-validator.js';

/** Campo multipart dos arquivos. Campos de texto devem vir ANTES dos arquivos. */
export const FILES_FIELD = 'files';
const MAX_TEXT_FIELDS = 10;
const MAX_FIELD_BYTES = 8 * 1024;
/** Limite global do corpo: 10 × 5 MB + margem para cabeçalhos multipart e campos. */
export const MAX_BODY_BYTES = MAX_FILES * MAX_FILE_BYTES + 512 * 1024;

export interface ReceivedFile {
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}

export interface ReceiveOptions {
  storage: StorageProvider;
  /**
   * Executado uma vez, com os campos de texto, ANTES de qualquer byte de arquivo
   * ser armazenado (validação de campos, captcha, loja/link). Lançar aborta tudo.
   */
  beforeFiles: (fields: Record<string, string>) => Promise<void>;
  onFileRejected?: (reason: FileRejection | 'too_large' | 'too_many') => void;
  /** Remove objetos já gravados quando o recebimento falha. */
  cleanup: (keys: string[]) => Promise<void>;
}

const tooMany = (): AppError =>
  new AppError(ApiErrorCode.VALIDATION_FAILED, SUBMISSION_MESSAGES.tooManyFiles, [
    { path: FILES_FIELD, message: SUBMISSION_MESSAGES.tooManyFiles },
  ]);

const tooLarge = (index: number): AppError =>
  new AppError(ApiErrorCode.PAYLOAD_TOO_LARGE, SUBMISSION_MESSAGES.fileTooLarge, [
    { path: `${FILES_FIELD}.${index}`, message: SUBMISSION_MESSAGES.fileTooLarge },
  ]);

const invalidFile = (index: number): AppError =>
  new AppError(ApiErrorCode.INVALID_FILE, SUBMISSION_MESSAGES.invalidFormat, [
    { path: `${FILES_FIELD}.${index}`, message: SUBMISSION_MESSAGES.invalidFormat },
  ]);

const malformed = (message = 'Requisição inválida.'): AppError =>
  new AppError(ApiErrorCode.VALIDATION_FAILED, message);

/**
 * Recebe o multipart em streaming (D-042): limites aplicados pelo parser antes de
 * bufferizar; tipo validado pelos magic bytes dos primeiros bytes; conteúdo enviado
 * ao storage em stream, com SHA-256 e tamanho calculados no caminho.
 */
export async function receiveUpload(
  req: IncomingMessage,
  options: ReceiveOptions,
): Promise<{ fields: Record<string, string>; files: ReceivedFile[] }> {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw malformed('Envie os arquivos como multipart/form-data.');
  }
  const declaredLength = Number(req.headers['content-length'] ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    options.onFileRejected?.('too_large');
    throw new AppError(ApiErrorCode.PAYLOAD_TOO_LARGE);
  }

  let parser: busboy.Busboy;
  try {
    parser = busboy({
      headers: req.headers,
      defParamCharset: 'utf8',
      limits: {
        files: MAX_FILES,
        // +1: o busboy sinaliza truncamento ao atingir o limite; o tamanho real é
        // verificado no stream (exatamente 5 MB é aceito, 5 MB + 1 byte não).
        fileSize: MAX_FILE_BYTES + 1,
        fields: MAX_TEXT_FIELDS,
        fieldSize: MAX_FIELD_BYTES,
        parts: MAX_FILES + MAX_TEXT_FIELDS,
        headerPairs: 20,
      },
    });
  } catch {
    throw malformed();
  }

  const fields: Record<string, string> = {};
  const writtenKeys: string[] = [];
  const pending: Promise<ReceivedFile>[] = [];
  let gate: Promise<void> | undefined;
  let failure: unknown;
  let fileIndex = 0;

  const fail = (error: unknown): void => {
    failure ??= error;
  };

  async function storeFile(
    stream: Readable,
    filename: string,
    index: number,
  ): Promise<ReceivedFile> {
    const iterator = stream[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
    const headChunks: Buffer[] = [];
    let headLength = 0;
    let ended = false;
    while (headLength < DETECTION_BYTES) {
      const next = await iterator.next();
      if (next.done) {
        ended = true;
        break;
      }
      headChunks.push(next.value);
      headLength += next.value.length;
    }
    const head = Buffer.concat(headChunks);
    if (head.length > MAX_FILE_BYTES) {
      options.onFileRejected?.('too_large');
      stream.resume();
      throw tooLarge(index);
    }
    const check = await checkFile(filename, head.subarray(0, DETECTION_BYTES));
    if (!check.ok) {
      options.onFileRejected?.(check.reason);
      stream.resume();
      throw invalidFile(index);
    }

    const hash = createHash('sha256');
    let size = 0;
    const truncated = (): boolean =>
      (stream as Readable & { truncated?: boolean }).truncated === true;
    const body = Readable.from(
      (async function* () {
        hash.update(head);
        size += head.length;
        yield head;
        if (!ended) {
          for (;;) {
            const next = await iterator.next();
            if (next.done) break;
            hash.update(next.value);
            size += next.value.length;
            if (size > MAX_FILE_BYTES) throw tooLarge(index);
            yield next.value;
          }
        }
        if (truncated()) throw tooLarge(index);
      })(),
    );

    const storageKey = generateStorageKey('prescriptions');
    writtenKeys.push(storageKey);
    try {
      await options.storage.putObjectStream({ key: storageKey, body, contentType: check.mimeType });
    } catch (error) {
      if (truncated()) {
        options.onFileRejected?.('too_large');
        throw tooLarge(index);
      }
      throw error;
    }
    if (truncated()) {
      options.onFileRejected?.('too_large');
      throw tooLarge(index);
    }
    return {
      storageKey,
      originalFilename: filename,
      mimeType: check.mimeType,
      sizeBytes: size,
      checksum: hash.digest('hex'),
    };
  }

  await new Promise<void>((resolve) => {
    parser.on('field', (name, value, info) => {
      if (gate) return fail(malformed('Envie os campos antes dos arquivos.'));
      if (info.nameTruncated || info.valueTruncated) return fail(malformed());
      fields[name] = value;
    });

    parser.on('file', (name, stream, info) => {
      if (failure || name !== FILES_FIELD) {
        if (name !== FILES_FIELD) fail(malformed());
        stream.resume();
        return;
      }
      const index = fileIndex;
      fileIndex += 1;
      gate ??= options.beforeFiles({ ...fields });
      const filename = sanitizeOriginalFilename(info.filename ?? '');
      const task = gate.then(
        () => storeFile(stream, filename, index),
        (error: unknown) => {
          stream.resume();
          throw error;
        },
      );
      task.catch((error: unknown) => {
        stream.resume();
        fail(error);
      });
      pending.push(task);
    });

    parser.on('filesLimit', () => {
      options.onFileRejected?.('too_many');
      fail(tooMany());
    });
    parser.on('fieldsLimit', () => fail(malformed()));
    parser.on('partsLimit', () => fail(malformed()));
    parser.on('error', (error) => {
      fail(error instanceof AppError ? error : malformed());
      resolve();
    });
    parser.on('close', () => resolve());
    req.on('aborted', () => {
      fail(malformed());
      resolve();
    });
    req.pipe(parser);
  });

  const settled = await Promise.allSettled(pending);
  if (!failure && pending.length === 0) {
    // Sem arquivos: ainda valida os campos (captcha etc.) para responder corretamente.
    try {
      await options.beforeFiles({ ...fields });
      failure = new AppError(ApiErrorCode.VALIDATION_FAILED, 'Envie ao menos um arquivo.', [
        { path: FILES_FIELD, message: 'Envie ao menos um arquivo.' },
      ]);
    } catch (error) {
      failure = error;
    }
  }
  const rejected = settled.find((result) => result.status === 'rejected');
  if (failure || rejected) {
    await options.cleanup(writtenKeys);
    throw failure ?? (rejected as PromiseRejectedResult).reason;
  }
  return {
    fields,
    files: settled.map((result) => (result as PromiseFulfilledResult<ReceivedFile>).value),
  };
}
