import { redirect } from 'next/navigation';

/** O dashboard chega na Fase 4; por ora o Admin abre na fila de receitas. */
export default function AdminHome() {
  redirect('/admin/receitas');
}
