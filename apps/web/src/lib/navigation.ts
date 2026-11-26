import { hasPermission, Permission, type Role } from '@receita/shared';

export interface NavItem {
  href: string;
  label: string;
  permission: Permission;
}

/** Itens do menu do Admin, na ordem do DESIGN.md §13.5. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', permission: Permission.DASHBOARD_READ },
  { href: '/admin/receitas', label: 'Receitas', permission: Permission.PRESCRIPTIONS_READ },
  {
    href: '/admin/links',
    label: 'Links personalizados',
    permission: Permission.PATIENT_LINKS_READ,
  },
  { href: '/admin/lojas', label: 'Lojas', permission: Permission.STORES_READ },
  { href: '/admin/usuarios', label: 'Usuários', permission: Permission.USERS_MANAGE },
];

/** Itens não autorizados não aparecem (DESIGN.md §8.2). A autorização real é no backend. */
export function navItemsFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => hasPermission(role, item.permission));
}

/**
 * Entra no Admin com navegação completa (não `router.push`).
 *
 * A CSP é aplicada por documento em `src/proxy.ts`: as páginas de autenticação
 * não liberam a origem do storage, que só o Admin precisa (visualizador de
 * anexos). Uma navegação no cliente manteria a CSP do `/login`, e as imagens e
 * PDFs por URL assinada seriam bloqueados até um recarregamento.
 */
export function enterAdmin(path: string): void {
  window.location.replace(path);
}
