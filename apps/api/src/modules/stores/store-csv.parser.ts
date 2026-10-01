import { type StoreImportRowError, storeFieldsSchema, storeNumberSchema } from '@receita/shared';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';

export const MAX_IMPORT_ROWS = 5000;

const REQUIRED_COLUMNS = ['store_number', 'store_name', 'active'] as const;
const OPTIONAL_COLUMNS = ['address', 'neighborhood', 'city', 'state'] as const;

const TRUE_VALUES = new Set(['true', '1', 'sim', 's', 'yes', 'y', 'ativo', 'ativa']);
const FALSE_VALUES = new Set(['false', '0', 'nao', 'não', 'n', 'no', 'inativo', 'inativa']);

const activeSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = value.toLowerCase();
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;
    ctx.addIssue({ code: 'custom', message: 'Use true/false, sim/não ou 1/0.' });
    return z.NEVER;
  });

const rowSchema = z.object({
  storeNumber: storeNumberSchema,
  storeName: storeFieldsSchema.shape.storeName,
  active: activeSchema,
  address: storeFieldsSchema.shape.address,
  neighborhood: storeFieldsSchema.shape.neighborhood,
  city: storeFieldsSchema.shape.city,
  state: storeFieldsSchema.shape.state,
});

export type StoreCsvRow = z.infer<typeof rowSchema> & { line: number };

const FIELD_TO_COLUMN: Record<string, string> = {
  storeNumber: 'store_number',
  storeName: 'store_name',
  active: 'active',
  address: 'address',
  neighborhood: 'neighborhood',
  city: 'city',
  state: 'state',
};

export interface StoreCsvParseResult {
  rows: StoreCsvRow[];
  errors: StoreImportRowError[];
  totalRows: number;
}

/**
 * Parser do CSV de lojas (PRD §16.2/16.3). Aceita `,` ou `;` (padrão do Excel em
 * pt-BR), BOM UTF-8 e cabeçalhos em qualquer caixa. Valida linha a linha e
 * acumula erros com o número da linha, sem interromper as demais.
 */
export function parseStoresCsv(content: string): StoreCsvParseResult {
  // Delimitador detectado pelo cabeçalho: aceitar ambos ao mesmo tempo quebraria
  // valores com vírgula (ex.: endereços) em arquivos separados por ponto e vírgula.
  const headerLine = content.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const delimiter = headerLine.includes(';') ? ';' : ',';
  let records: string[][];
  try {
    records = parse(content, {
      bom: true,
      delimiter,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
    });
  } catch {
    return {
      rows: [],
      errors: [{ line: 1, message: 'Arquivo CSV inválido ou corrompido.' }],
      totalRows: 0,
    };
  }

  const [header, ...data] = records;
  if (!header) return { rows: [], errors: [{ line: 1, message: 'Arquivo vazio.' }], totalRows: 0 };

  const columns = header.map((name) => name.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ line: 1, message: `Colunas obrigatórias ausentes: ${missing.join(', ')}.` }],
      totalRows: data.length,
    };
  }
  if (data.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [{ line: 1, message: `O arquivo excede o limite de ${MAX_IMPORT_ROWS} linhas.` }],
      totalRows: data.length,
    };
  }

  const index = (column: string): number => columns.indexOf(column);
  const rows: StoreCsvRow[] = [];
  const errors: StoreImportRowError[] = [];
  const seen = new Map<string, number>();

  data.forEach((record, position) => {
    const line = position + 2;
    const cell = (column: string): string | undefined => {
      const i = index(column);
      return i >= 0 ? record[i] : undefined;
    };
    const parsed = rowSchema.safeParse({
      storeNumber: cell('store_number') ?? '',
      storeName: cell('store_name') ?? '',
      active: cell('active') ?? '',
      ...Object.fromEntries(
        OPTIONAL_COLUMNS.map((column) => [
          column === 'state' ? 'state' : column,
          cell(column) || undefined,
        ]),
      ),
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '');
        errors.push({ line, field: FIELD_TO_COLUMN[field] ?? field, message: issue.message });
      }
      return;
    }

    const firstLine = seen.get(parsed.data.storeNumber);
    if (firstLine !== undefined) {
      errors.push({
        line,
        field: 'store_number',
        message: `store_number duplicado no arquivo (já informado na linha ${firstLine}).`,
      });
      return;
    }
    seen.set(parsed.data.storeNumber, line);
    rows.push({ ...parsed.data, line });
  });

  return { rows, errors, totalRows: data.length };
}
