/**
 * Enums de domínio (PRD §11, §14, §17, §25). Os valores são espelhados no schema
 * Prisma da API — qualquer alteração aqui exige migration correspondente.
 */

export const Role = {
  STORE_COLLABORATOR: 'STORE_COLLABORATOR',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ROLES = Object.values(Role);

export const OperationalStatus = {
  RECEIVED: 'RECEIVED',
  IN_REVIEW: 'IN_REVIEW',
  IN_SERVICE: 'IN_SERVICE',
  FINISHED: 'FINISHED',
  CANCELLED: 'CANCELLED',
  NOT_SERVED: 'NOT_SERVED',
} as const;
export type OperationalStatus = (typeof OperationalStatus)[keyof typeof OperationalStatus];

export const IdentificationStatus = {
  NOT_IDENTIFIED: 'NOT_IDENTIFIED',
  IDENTIFIED_AUTO_CPF: 'IDENTIFIED_AUTO_CPF',
  IDENTIFIED_MANUAL: 'IDENTIFIED_MANUAL',
  IDENTIFIED_PERSONALIZED_LINK: 'IDENTIFIED_PERSONALIZED_LINK',
} as const;
export type IdentificationStatus = (typeof IdentificationStatus)[keyof typeof IdentificationStatus];

export const SourceChannel = {
  GENERIC: 'GENERIC',
  STORE_LINK: 'STORE_LINK',
  PERSONALIZED_LINK: 'PERSONALIZED_LINK',
} as const;
export type SourceChannel = (typeof SourceChannel)[keyof typeof SourceChannel];

/**
 * Status do link personalizado como exibido ao usuário. `EXPIRED` nunca é
 * persistido: é derivado de `expires_at` na leitura (ver `deriveLinkStatus`).
 */
export const PatientUploadLinkStatus = {
  ACTIVE: 'ACTIVE',
  USED: 'USED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
} as const;
export type PatientUploadLinkStatus =
  (typeof PatientUploadLinkStatus)[keyof typeof PatientUploadLinkStatus];

export const PatientLinkType = {
  AUTOMATIC_CPF: 'AUTOMATIC_CPF',
  MANUAL: 'MANUAL',
  PERSONALIZED_LINK: 'PERSONALIZED_LINK',
} as const;
export type PatientLinkType = (typeof PatientLinkType)[keyof typeof PatientLinkType];

export const MalwareScanStatus = {
  PENDING: 'PENDING',
  CLEAN: 'CLEAN',
  INFECTED: 'INFECTED',
  FAILED: 'FAILED',
} as const;
export type MalwareScanStatus = (typeof MalwareScanStatus)[keyof typeof MalwareScanStatus];

export const AuditResult = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  DENIED: 'DENIED',
} as const;
export type AuditResult = (typeof AuditResult)[keyof typeof AuditResult];

/** Ações auditáveis (PRD §23). Fases futuras acrescentam itens aqui. */
export const AuditAction = {
  AUTH_LOGIN_SUCCEEDED: 'auth.login.succeeded',
  AUTH_LOGIN_FAILED: 'auth.login.failed',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_MFA_VERIFIED: 'auth.mfa.verified',
  AUTH_MFA_FAILED: 'auth.mfa.failed',
  AUTH_TOTP_ENABLED: 'auth.totp.enabled',
  AUTH_TOTP_DISABLED: 'auth.totp.disabled',
  AUTH_TOTP_RESET_BY_ADMIN: 'auth.totp.reset_by_admin',
  AUTH_RECOVERY_CODES_REGENERATED: 'auth.totp.recovery_codes_regenerated',
  AUTH_PASSWORD_RESET_REQUESTED: 'auth.password_reset.requested',
  AUTH_PASSWORD_RESET_COMPLETED: 'auth.password_reset.completed',
  AUTH_SESSIONS_REVOKED: 'auth.sessions.revoked',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_ACTIVATED: 'user.activated',
  USER_DEACTIVATED: 'user.deactivated',
  USER_STORE_SCOPE_CHANGED: 'user.store_scope.changed',
  STORE_IMPORTED: 'store.import.completed',
  STORE_UPDATED: 'store.updated',
  SETTINGS_UPDATED: 'settings.updated',
  PATIENT_SEARCH_PERFORMED: 'patient.search.performed',
  PATIENT_LINK_CREATED: 'patient_link.created',
  PATIENT_LINK_REVOKED: 'patient_link.revoked',
  PATIENT_LINK_CONSUMED: 'patient_link.consumed',
  AUTHZ_DENIED: 'authz.denied',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
