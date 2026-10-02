import type { ReactNode } from 'react';
import { Brand } from '@/components/brand/brand';

/** Área pública: coluna única, mobile first, largura controlada (DESIGN §5.1, §5.2, §6.1). */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="flex justify-center px-4 pt-6 pb-2">
        <Brand height={32} />
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-4 pb-10">
        <div className="rounded-card bg-surface p-4 shadow-card sm:p-6">{children}</div>
      </main>
    </div>
  );
}
