import Link from 'next/link';
import { Brand } from '@/components/brand/brand';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Brand />
      <h1 className="text-h2 font-semibold">Página não encontrada</h1>
      <Link href="/admin" className="text-link underline">
        Voltar ao início
      </Link>
    </main>
  );
}
