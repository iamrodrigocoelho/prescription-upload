/**
 * Regras de upload de receitas (PRD §9). Usadas pelo frontend (validação de
 * conveniência) e pela API (que revalida tudo, inclusive por magic bytes).
 */

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Extensão → MIMEs reais aceitos para ela (detectados por magic bytes no backend). */
export const EXTENSION_MIME_TYPES = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  heic: ['image/heic', 'image/heif'],
  heif: ['image/heic', 'image/heif'],
  pdf: ['application/pdf'],
} as const satisfies Record<string, readonly string[]>;

export type AllowedExtension = keyof typeof EXTENSION_MIME_TYPES;
export const ALLOWED_EXTENSIONS = Object.keys(EXTENSION_MIME_TYPES) as AllowedExtension[];

/** Valor do atributo `accept` do input de arquivos. */
export const FILE_INPUT_ACCEPT =
  '.jpg,.jpeg,.png,.heic,.heif,.pdf,image/jpeg,image/png,image/heic,image/heif,application/pdf';

/** Microcopy do DESIGN.md §6.3 e §7 — use exatamente estes textos. */
export const SUBMISSION_MESSAGES = {
  title: 'Envio de receita',
  support:
    'Fotografe ou anexe sua receita médica. Certifique-se de que a imagem esteja nítida e que todas as informações estejam visíveis.',
  personalizedSupport: 'Envie sua receita para a Drogaria Venancio',
  cpfLabel: 'CPF do paciente (opcional)',
  chooseFiles: 'Escolher arquivos',
  takePhoto: 'Tirar foto',
  guidance:
    'Você pode enviar até 10 arquivos nos formatos JPG, JPEG, PNG, HEIC ou PDF, com no máximo 5 MB por arquivo.',
  submit: 'Enviar',
  success: 'Receita enviada com sucesso.',
  generalFailure: 'Não foi possível enviar sua receita. Tente novamente.',
  fileTooLarge: 'Este arquivo ultrapassa o limite de 5 MB.',
  tooManyFiles: 'Você pode enviar no máximo 10 arquivos.',
  invalidFormat: 'Formato de arquivo não permitido.',
  invalidCpf: 'CPF inválido.',
  captchaPending: 'Conclua a verificação de segurança para continuar.',
  storeUnavailable: 'Esta loja não está disponível para novos envios no momento.',
  linkUnavailable: 'Este link não está mais disponível. Solicite um novo link à Drogaria Venancio.',
} as const;

export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

export function isAllowedExtension(extension: string): extension is AllowedExtension {
  return Object.hasOwn(EXTENSION_MIME_TYPES, extension);
}

/** Validação no cliente: formato pela extensão e tamanho. `null` = válido. */
export function clientFileError(file: { name: string; size: number }): string | null {
  if (!isAllowedExtension(fileExtension(file.name))) return SUBMISSION_MESSAGES.invalidFormat;
  if (file.size > MAX_FILE_BYTES) return SUBMISSION_MESSAGES.fileTooLarge;
  if (file.size === 0) return SUBMISSION_MESSAGES.invalidFormat;
  return null;
}

// eslint-disable-next-line no-control-regex -- remover caracteres de controle é o objetivo
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Nome original saneado para metadado: sem caminho, sem controle, NFC, até 255. */
export function sanitizeOriginalFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const cleaned = base.normalize('NFC').replace(CONTROL_CHARS, '').trim();
  return (cleaned || 'arquivo').slice(0, 255);
}
