import { redirect } from 'next/navigation';

/** O dashboard chega na Fase 4; por ora o Admin abre nos links personalizados. */
export default function AdminHome() {
  redirect('/admin/links');
}
