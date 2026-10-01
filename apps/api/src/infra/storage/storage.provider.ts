export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
  /** SHA-256 em hex do conteúdo, gravado como metadado para verificação de integridade. */
  sha256?: string;
}

export interface SignedUrlOptions {
  /** `inline` para visualização no navegador; `attachment` para download. */
  disposition: 'inline' | 'attachment';
  filename: string;
  contentType: string;
  /** Padrão: SIGNED_URL_TTL_SECONDS. */
  ttlSeconds?: number;
}

export interface ObjectInfo {
  size: number;
  contentType: string | undefined;
}

/**
 * Abstração de object storage privado (PRD §9.4, §24.5). Nenhum objeto é público:
 * o acesso é sempre por URL assinada de curta duração.
 */
export abstract class StorageProvider {
  abstract putObject(input: PutObjectInput): Promise<void>;
  abstract getSignedUrl(key: string, options: SignedUrlOptions): Promise<string>;
  abstract headObject(key: string): Promise<ObjectInfo | null>;
  abstract deleteObject(key: string): Promise<void>;
  /** Verifica se o bucket está acessível (readiness). */
  abstract ping(): Promise<void>;
}
