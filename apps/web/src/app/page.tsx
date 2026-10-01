import { redirect } from 'next/navigation';

/** A área pública (envio de receitas) chega na Fase 2. */
export default function Home() {
  redirect('/admin');
}
