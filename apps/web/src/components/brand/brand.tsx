import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Image from 'next/image';
import { cx } from '@/lib/cx';

const LOGO_PATH = '/brand/venancio-logo.png';
// Proporção do arquivo oficial (/img/logo/venancio_logo-png.png: 1780 × 351).
const LOGO_RATIO = 1780 / 351;

/**
 * Logotipo oficial, carregado exclusivamente de /img/logo (copiado para
 * public/brand no build — scripts/sync-brand.mjs). Sem o arquivo, exibe o
 * placeholder textual "VENANCIO" (DESIGN.md §2.1).
 */
export function Brand({ height = 32, className }: { height?: number; className?: string }) {
  const hasLogo = existsSync(join(process.cwd(), 'public', LOGO_PATH));
  if (!hasLogo) {
    return (
      <span
        className={cx('text-h2 font-bold tracking-wide text-content', className)}
        aria-label="Drogaria Venancio"
      >
        VENANCIO
      </span>
    );
  }
  return (
    <Image
      src={LOGO_PATH}
      alt="Drogaria Venancio"
      width={Math.round(height * LOGO_RATIO)}
      height={height}
      priority
      className={className}
    />
  );
}
