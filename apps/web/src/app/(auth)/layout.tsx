import type { ReactNode } from 'react';
import { Brand } from '@/components/brand/brand';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-10">
      <div className="flex justify-center">
        <Brand height={36} />
      </div>
      <div className="rounded-card border border-line bg-surface p-6 shadow-card">{children}</div>
    </main>
  );
}
