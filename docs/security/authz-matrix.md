# Matriz de autorização — rotas registradas no NestJS

Gerada/verificada por `apps/api/test/authz-coverage.e2e-spec.ts`. `Sim` significa que o perfil passa pelos guards de permissão e escopo; consultas por recurso também filtram por loja. Rotas de 2FA exigem o estado de sessão indicado em `Condição`. `/metrics` requer Bearer de serviço e não usa sessão.

| Rota | Anônimo | Colaborador | Gestor | Administrador | Serviço | Escopo | Condição |
|---|---|---|---|---|---|---|---|
| `GET /admin/audit-logs` | — | — | — | Sim | — | Global (Admin) | audit:read |
| `GET /admin/patient-links` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | patient_links:read |
| `GET /admin/patient-links/options` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | patient_links:manage |
| `GET /admin/settings` | — | — | — | Sim | — | Global (Admin) | settings:manage |
| `GET /admin/stores` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | stores:read |
| `GET /admin/stores/:id` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | stores:read |
| `GET /admin/stores/:id/public-link` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | stores:read |
| `GET /admin/users` | — | — | — | Sim | — | Global (Admin) | users:manage |
| `GET /admin/users/:id` | — | — | — | Sim | — | Global (Admin) | users:manage |
| `GET /auth/me` | — | Sim | Sim | Sim | — | Própria conta | Sessão: ACTIVE, PENDING_MFA, MFA_ENROLLMENT_REQUIRED |
| `GET /dashboard/by-status` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | dashboard:read |
| `GET /dashboard/by-store` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | dashboard:read |
| `GET /dashboard/summary` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | dashboard:read |
| `GET /dashboard/timeseries` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | dashboard:read |
| `GET /health` | Sim | Sim | Sim | Sim | — | Público | Público explícito |
| `GET /health/ready` | Sim | Sim | Sim | Sim | — | Público | Público explícito |
| `GET /me/preferences` | — | Sim | Sim | Sim | — | Própria conta | Sessão ativa |
| `GET /metrics` | — | — | — | — | Sim | Token de serviço | Bearer de serviço |
| `GET /prescriptions` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | prescriptions:read |
| `GET /prescriptions/:id` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | prescriptions:read |
| `GET /prescriptions/:id/files/:fileId/download-url` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | prescriptions:read |
| `GET /prescriptions/:id/files/:fileId/view-url` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | prescriptions:read |
| `GET /prescriptions/counters` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | prescriptions:read |
| `GET /public/patient-link-sessions/current` | Sim | Sim | Sim | Sim | — | Público | Público explícito |
| `GET /public/patient-links/:token` | Sim | Sim | Sim | Sim | — | Público | Público explícito |
| `GET /public/stores` | Sim | Sim | Sim | Sim | — | Público | Público explícito |
| `GET /public/stores/:slug` | Sim | Sim | Sim | Sim | — | Público | Público explícito |
| `GET /realtime/stream` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | prescriptions:read |
| `PATCH /admin/retention/:id/legal-hold` | — | — | — | Sim | — | Global (Admin) | settings:manage |
| `PATCH /admin/settings` | — | — | — | Sim | — | Global (Admin) | settings:manage |
| `PATCH /admin/stores/:id` | — | — | — | Sim | — | Global (Admin) | stores:manage |
| `PATCH /admin/users/:id` | — | — | — | Sim | — | Global (Admin) | users:manage |
| `PATCH /me/preferences` | — | Sim | Sim | Sim | — | Própria conta | Sessão ativa |
| `PATCH /prescriptions/:id/status` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | prescriptions:update_status |
| `POST /admin/patient-links` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | patient_links:manage |
| `POST /admin/patient-links/:id/revoke` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | patient_links:manage |
| `POST /admin/stores` | — | — | — | Sim | — | Global (Admin) | stores:manage |
| `POST /admin/stores/import` | — | — | — | Sim | — | Global (Admin) | stores:manage |
| `POST /admin/users` | — | — | — | Sim | — | Global (Admin) | users:manage |
| `POST /admin/users/:id/invite` | — | — | — | Sim | — | Global (Admin) | users:manage |
| `POST /admin/users/:id/sessions/revoke` | — | — | — | Sim | — | Global (Admin) | users:manage |
| `POST /admin/users/:id/totp/reset` | — | — | — | Sim | — | Global (Admin) | users:manage |
| `POST /auth/forgot-password` | Sim | Sim | Sim | Sim | — | Público | Público explícito |
| `POST /auth/login` | Sim | Sim | Sim | Sim | — | Público | Público explícito |
| `POST /auth/logout` | — | Sim | Sim | Sim | — | Própria conta | Sessão: ACTIVE, PENDING_MFA, MFA_ENROLLMENT_REQUIRED |
| `POST /auth/reset-password` | Sim | Sim | Sim | Sim | — | Público | Público explícito |
| `POST /auth/totp/confirm` | — | Sim | Sim | Sim | — | Própria conta | Sessão: ACTIVE, MFA_ENROLLMENT_REQUIRED |
| `POST /auth/totp/disable` | — | Sim | Sim | Sim | — | Própria conta | Sessão ativa |
| `POST /auth/totp/recovery-codes` | — | Sim | Sim | Sim | — | Própria conta | Sessão ativa |
| `POST /auth/totp/setup` | — | Sim | Sim | Sim | — | Própria conta | Sessão: ACTIVE, MFA_ENROLLMENT_REQUIRED |
| `POST /auth/totp/verify` | — | Sim | Sim | Sim | — | Própria conta | Sessão: PENDING_MFA |
| `POST /patients/search` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | patients:search |
| `POST /prescriptions/:id/cpf/reveal` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | prescriptions:reveal_cpf |
| `POST /prescriptions/:id/open` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | prescriptions:read |
| `POST /prescriptions/:id/patient-link` | — | Sim | Sim | Sim | — | Lojas do usuário; Admin global | prescriptions:link_patient |
| `POST /public/patient-link-sessions` | Sim | Sim | Sim | Sim | — | Público | Público explícito |
| `POST /public/patient-link-sessions/current/prescriptions` | Sim | Sim | Sim | Sim | — | Público | Público explícito |
| `POST /public/patient-links/:token/prescriptions` | Sim | Sim | Sim | Sim | — | Público | Público explícito |
| `POST /public/prescriptions` | Sim | Sim | Sim | Sim | — | Público | Público explícito |
| `PUT /admin/users/:id/stores` | — | — | — | Sim | — | Global (Admin) | users:manage |
