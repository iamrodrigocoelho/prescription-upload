import type { PatientUploadLinkStatus, Role } from '@receita/shared';

export const ROLE_LABELS: Record<Role, string> = {
  STORE_COLLABORATOR: 'Colaborador da Loja',
  MANAGER: 'Gestor/Supervisor',
  ADMIN: 'Administrador',
};

export const LINK_STATUS_LABELS: Record<PatientUploadLinkStatus, string> = {
  ACTIVE: 'Ativo',
  USED: 'Utilizado',
  EXPIRED: 'Expirado',
  REVOKED: 'Revogado',
};
