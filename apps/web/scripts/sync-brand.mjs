/**
 * Copia o logotipo e o favicon oficiais de /img/logo (única origem — DESIGN.md §2.1) para
 * public/brand, que é gitignored. Nenhum logo é versionado dentro do app.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const logoDir = resolve(here, '../../../img/logo');
const targetDir = resolve(here, '../public/brand');

// [arquivo em /img/logo, nome em public/brand]
const assets = [
  // O componente <Brand/> cai no placeholder textual quando o arquivo não existe.
  ['logo_venancio.png', 'venancio-logo.png'],
  // Favicon (símbolo); referenciado em app/layout.tsx (metadata.icons).
  ['logo_venancio_tiktok.png', 'venancio-icon.png'],
];

mkdirSync(targetDir, { recursive: true });
for (const [from, to] of assets) {
  const source = resolve(logoDir, from);
  if (existsSync(source)) {
    copyFileSync(source, resolve(targetDir, to));
  } else {
    process.stderr.write(`Aviso: ${from} não encontrado em /img/logo.\n`);
  }
}
