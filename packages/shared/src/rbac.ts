import { Role } from './enums.js';

/**
 * Permissões por perfil (PRD §14). O backend é a autoridade: o frontend usa esta
 * matriz apenas para esconder itens de navegação não autorizados.
 */
export const Permission = {
  STORES_READ: 'stores:read',
  STORES_MANAGE: 'stores:manage',
  USERS_MANAGE: 'users:manage',
  SETTINGS_MANAGE: 'settings:manage',
  AUDIT_READ: 'audit:read',
  PATIENT_LINKS_READ: 'patient_links:read',
  PATIENT_LINKS_MANAGE: 'patient_links:manage',
  PATIENTS_SEARCH: 'patients:search',
  PRESCRIPTIONS_READ: 'prescriptions:read',
  PRESCRIPTIONS_UPDATE_STATUS: 'prescriptions:update_status',
  /** Isolada para poder ser restringida no futuro sem mudar código (D-056). */
  PRESCRIPTIONS_REVEAL_CPF: 'prescriptions:reveal_cpf',
  PRESCRIPTIONS_REOPEN: 'prescriptions:reopen',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const OPERATIONAL: readonly Permission[] = [
  Permission.STORES_READ,
  Permission.PATIENT_LINKS_READ,
  Permission.PATIENT_LINKS_MANAGE,
  Permission.PATIENTS_SEARCH,
  Permission.PRESCRIPTIONS_READ,
  Permission.PRESCRIPTIONS_UPDATE_STATUS,
  Permission.PRESCRIPTIONS_REVEAL_CPF,
];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  [Role.STORE_COLLABORATOR]: OPERATIONAL,
  [Role.MANAGER]: [...OPERATIONAL, Permission.PRESCRIPTIONS_REOPEN],
  [Role.ADMIN]: Object.values(Permission),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Escopo de lojas: Admin tem acesso global; Colaborador e Gestor, apenas às lojas
 * vinculadas (UserStoreAccess).
 */
export type StoreScope = { all: true } | { all: false; storeIds: readonly string[] };

export function resolveStoreScope(role: Role, linkedStoreIds: readonly string[]): StoreScope {
  return role === Role.ADMIN ? { all: true } : { all: false, storeIds: [...linkedStoreIds] };
}

export function isStoreInScope(scope: StoreScope, storeId: string): boolean {
  return scope.all || scope.storeIds.includes(storeId);
}

/** Regras de vínculo de lojas por perfil (D-015). */
export function storeAssignmentIssue(role: Role, storeCount: number): string | null {
  if (role === Role.ADMIN) {
    return storeCount > 0 ? 'Administradores têm acesso global e não recebem lojas.' : null;
  }
  return storeCount === 0 ? 'Selecione ao menos uma loja para este perfil.' : null;
}
