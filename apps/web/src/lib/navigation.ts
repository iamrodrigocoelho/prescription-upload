import { hasPermission, Permission, type Role } from '@receita/shared';

export interface NavItem {
  href: string;
  label: string;
  permission: Permission;
}

/** Itens do menu do Admin. Telas futuras (Dashboard, Receitas) entram aqui. */
export const NAV_ITEMS: readonly NavItem[] = [
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
