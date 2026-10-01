import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carrega o `.env` da raiz do monorepo em desenvolvimento. Variáveis já presentes
 * no ambiente têm precedência (produção injeta via orquestrador, sem arquivo).
 */
export function loadRootEnv(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  const file = candidates.find((path) => existsSync(path));
  if (file) process.loadEnvFile(file);
}
