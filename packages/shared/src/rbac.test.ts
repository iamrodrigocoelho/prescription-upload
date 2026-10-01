import { describe, expect, it } from 'vitest';
import { Role } from './enums.js';
import {
  hasPermission,
  isStoreInScope,
  Permission,
  resolveStoreScope,
  ROLE_PERMISSIONS,
  storeAssignmentIssue,
} from './rbac.js';

describe('permissões por perfil', () => {
  it('Colaborador e Gestor não administram usuários, lojas, configurações nem auditoria', () => {
    for (const role of [Role.STORE_COLLABORATOR, Role.MANAGER]) {
      expect(hasPermission(role, Permission.USERS_MANAGE)).toBe(false);
      expect(hasPermission(role, Permission.STORES_MANAGE)).toBe(false);
      expect(hasPermission(role, Permission.SETTINGS_MANAGE)).toBe(false);
      expect(hasPermission(role, Permission.AUDIT_READ)).toBe(false);
    }
  });

  it('Colaborador e Gestor operam links personalizados e buscam pacientes', () => {
    for (const role of [Role.STORE_COLLABORATOR, Role.MANAGER]) {
      expect(hasPermission(role, Permission.PATIENT_LINKS_MANAGE)).toBe(true);
      expect(hasPermission(role, Permission.PATIENTS_SEARCH)).toBe(true);
      expect(hasPermission(role, Permission.STORES_READ)).toBe(true);
    }
  });

  it('Admin tem todas as permissões', () => {
    expect([...ROLE_PERMISSIONS[Role.ADMIN]].sort()).toEqual(Object.values(Permission).sort());
  });
});

describe('escopo de lojas', () => {
  it('Admin tem escopo global', () => {
    const scope = resolveStoreScope(Role.ADMIN, []);
    expect(scope).toEqual({ all: true });
    expect(isStoreInScope(scope, 'qualquer-loja')).toBe(true);
  });

  it('Colaborador só acessa as lojas vinculadas', () => {
    const scope = resolveStoreScope(Role.STORE_COLLABORATOR, ['loja-a']);
    expect(isStoreInScope(scope, 'loja-a')).toBe(true);
    expect(isStoreInScope(scope, 'loja-b')).toBe(false);
  });

  it('Gestor acessa apenas o conjunto sob sua responsabilidade', () => {
    const scope = resolveStoreScope(Role.MANAGER, ['loja-a', 'loja-b']);
    expect(isStoreInScope(scope, 'loja-b')).toBe(true);
    expect(isStoreInScope(scope, 'loja-c')).toBe(false);
  });

  it('não muta a lista recebida', () => {
    const ids = ['loja-a'];
    const scope = resolveStoreScope(Role.MANAGER, ids);
    ids.push('loja-b');
    expect(isStoreInScope(scope, 'loja-b')).toBe(false);
  });
});

describe('regras de vínculo de lojas', () => {
  it('Colaborador e Gestor exigem ao menos uma loja', () => {
    expect(storeAssignmentIssue(Role.STORE_COLLABORATOR, 0)).not.toBeNull();
    expect(storeAssignmentIssue(Role.MANAGER, 0)).not.toBeNull();
    expect(storeAssignmentIssue(Role.MANAGER, 2)).toBeNull();
  });

  it('Admin não recebe lojas', () => {
    expect(storeAssignmentIssue(Role.ADMIN, 0)).toBeNull();
    expect(storeAssignmentIssue(Role.ADMIN, 1)).not.toBeNull();
  });
});
