/**
 * Copia o logotipo oficial de /img/logo (única origem — DESIGN.md §2.1) para
 * public/brand, que é gitignored. Nenhum logo é versionado dentro do app.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../../img/logo/venancio_logo-png.png');
const targetDir = resolve(here, '../public/brand');

mkdirSync(targetDir, { recursive: true });
if (existsSync(source)) {
  copyFileSync(source, resolve(targetDir, 'venancio-logo.png'));
} else {
  // O componente <Brand/> cai no placeholder textual quando o arquivo não existe.
  process.stderr.write('Aviso: logotipo oficial não encontrado em /img/logo.\n');
}
