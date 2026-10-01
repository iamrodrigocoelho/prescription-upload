import { describe, expect, it } from 'vitest';
import { navItemsFor } from './navigation';

describe('navItemsFor', () => {
  it('Colaborador e Gestor não veem Usuários', () => {
    for (const role of ['STORE_COLLABORATOR', 'MANAGER'] as const) {
      expect(navItemsFor(role).map((i) => i.label)).toEqual(['Links personalizados', 'Lojas']);
    }
  });

  it('Admin vê todos os itens', () => {
    expect(navItemsFor('ADMIN').map((i) => i.label)).toEqual([
      'Links personalizados',
      'Lojas',
      'Usuários',
    ]);
  });
});
