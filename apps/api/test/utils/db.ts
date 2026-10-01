import type { PrismaService } from '../../src/infra/prisma/prisma.service.js';

/**
 * Limpa as tabelas entre suítes. `audit_logs` é append-only (TRUNCATE bloqueado por
 * trigger): os testes filtram eventos por entidade/ator em vez de esperar tabela vazia.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "patient_link_history", "status_history", "prescription_files",
      "patient_upload_links", "prescription_submissions",
      "totp_recovery_codes", "password_reset_tokens", "sessions",
      "user_store_access", "users", "stores"
    RESTART IDENTITY CASCADE
  `);
  // O CASCADE alcança system_settings (FK updated_by_user_id): reinsere os padrões.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "system_settings" ("key", "value", "updated_at") VALUES
      ('retention_days', '365', now()),
      ('patient_link_default_expiry_days', '7', now()),
      ('patient_link_max_expiry_days', '30', now())
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updated_by_user_id" = NULL
  `);
}
