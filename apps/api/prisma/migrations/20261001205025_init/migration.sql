-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STORE_COLLABORATOR', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "OperationalStatus" AS ENUM ('RECEIVED', 'IN_REVIEW', 'IN_SERVICE', 'FINISHED', 'CANCELLED', 'NOT_SERVED');

-- CreateEnum
CREATE TYPE "IdentificationStatus" AS ENUM ('NOT_IDENTIFIED', 'IDENTIFIED_AUTO_CPF', 'IDENTIFIED_MANUAL', 'IDENTIFIED_PERSONALIZED_LINK');

-- CreateEnum
CREATE TYPE "SourceChannel" AS ENUM ('GENERIC', 'STORE_LINK', 'PERSONALIZED_LINK');

-- CreateEnum
CREATE TYPE "PatientUploadLinkStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PatientLinkType" AS ENUM ('AUTOMATIC_CPF', 'MANUAL', 'PERSONALIZED_LINK');

-- CreateEnum
CREATE TYPE "MalwareScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('PENDING_MFA', 'MFA_ENROLLMENT_REQUIRED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "PasswordTokenPurpose" AS ENUM ('RESET', 'INVITE');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "store_number" VARCHAR(20) NOT NULL,
    "store_name" VARCHAR(200) NOT NULL,
    "public_slug" VARCHAR(32) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "address" VARCHAR(300),
    "neighborhood" VARCHAR(120),
    "city" VARCHAR(120),
    "state" CHAR(2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "totp_secret_encrypted" TEXT,
    "totp_pending_secret_encrypted" TEXT,
    "totp_required" BOOLEAN NOT NULL DEFAULT false,
    "totp_last_used_step" BIGINT,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_store_access" (
    "user_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_store_access_pkey" PRIMARY KEY ("user_id","store_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "state" "SessionState" NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(256),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(64),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "purpose" "PasswordTokenPurpose" NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "totp_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "totp_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_upload_links" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "patient_external_id" VARCHAR(128) NOT NULL,
    "patient_display_label" VARCHAR(200) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "status" "PatientUploadLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "used_submission_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_upload_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_submissions" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "cpf_encrypted" TEXT,
    "cpf_hash_for_lookup" CHAR(64),
    "operational_status" "OperationalStatus" NOT NULL DEFAULT 'RECEIVED',
    "identification_status" "IdentificationStatus" NOT NULL DEFAULT 'NOT_IDENTIFIED',
    "patient_external_id" VARCHAR(128),
    "source_channel" "SourceChannel" NOT NULL,
    "patient_upload_link_id" UUID,
    "idempotency_key" VARCHAR(64),
    "first_viewed_at" TIMESTAMPTZ(3),
    "retention_until" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "prescription_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_files" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "malware_scan_status" "MalwareScanStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_history" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "from_status" "OperationalStatus",
    "to_status" "OperationalStatus" NOT NULL,
    "changed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_link_history" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "patient_external_id" VARCHAR(128) NOT NULL,
    "link_type" "PatientLinkType" NOT NULL,
    "linked_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_link_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "actor_role" "Role",
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(128),
    "store_id" UUID,
    "result" "AuditResult" NOT NULL,
    "metadata" JSONB,
    "ip_address" VARCHAR(64),
    "correlation_id" VARCHAR(64),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_store_number_key" ON "stores"("store_number");

-- CreateIndex
CREATE UNIQUE INDEX "stores_public_slug_key" ON "stores"("public_slug");

-- CreateIndex
CREATE INDEX "stores_active_idx" ON "stores"("active");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "user_store_access_store_id_idx" ON "user_store_access"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "totp_recovery_codes_code_hash_key" ON "totp_recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "totp_recovery_codes_user_id_idx" ON "totp_recovery_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_upload_links_token_hash_key" ON "patient_upload_links"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "patient_upload_links_used_submission_id_key" ON "patient_upload_links"("used_submission_id");

-- CreateIndex
CREATE INDEX "patient_upload_links_store_id_created_at_idx" ON "patient_upload_links"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "patient_upload_links_status_expires_at_idx" ON "patient_upload_links"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "prescription_submissions_idempotency_key_key" ON "prescription_submissions"("idempotency_key");

-- CreateIndex
CREATE INDEX "prescription_submissions_store_id_created_at_idx" ON "prescription_submissions"("store_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "prescription_submissions_store_id_operational_status_idx" ON "prescription_submissions"("store_id", "operational_status");

-- CreateIndex
CREATE INDEX "prescription_submissions_cpf_hash_for_lookup_idx" ON "prescription_submissions"("cpf_hash_for_lookup");

-- CreateIndex
CREATE INDEX "prescription_submissions_retention_until_idx" ON "prescription_submissions"("retention_until");

-- CreateIndex
CREATE UNIQUE INDEX "prescription_files_storage_key_key" ON "prescription_files"("storage_key");

-- CreateIndex
CREATE INDEX "prescription_files_submission_id_idx" ON "prescription_files"("submission_id");

-- CreateIndex
CREATE INDEX "status_history_submission_id_created_at_idx" ON "status_history"("submission_id", "created_at");

-- CreateIndex
CREATE INDEX "patient_link_history_submission_id_created_at_idx" ON "patient_link_history"("submission_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_store_id_created_at_idx" ON "audit_logs"("store_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "user_store_access" ADD CONSTRAINT "user_store_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_store_access" ADD CONSTRAINT "user_store_access_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_store_access" ADD CONSTRAINT "user_store_access_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "totp_recovery_codes" ADD CONSTRAINT "totp_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_upload_links" ADD CONSTRAINT "patient_upload_links_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_upload_links" ADD CONSTRAINT "patient_upload_links_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_upload_links" ADD CONSTRAINT "patient_upload_links_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_upload_links" ADD CONSTRAINT "patient_upload_links_used_submission_id_fkey" FOREIGN KEY ("used_submission_id") REFERENCES "prescription_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_submissions" ADD CONSTRAINT "prescription_submissions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_submissions" ADD CONSTRAINT "prescription_submissions_patient_upload_link_id_fkey" FOREIGN KEY ("patient_upload_link_id") REFERENCES "patient_upload_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_files" ADD CONSTRAINT "prescription_files_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "prescription_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "prescription_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_link_history" ADD CONSTRAINT "patient_link_history_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "prescription_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_link_history" ADD CONSTRAINT "patient_link_history_linked_by_user_id_fkey" FOREIGN KEY ("linked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Restrições adicionais (não expressáveis no schema Prisma)
-- =============================================================================

-- E-mail sempre normalizado.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_chk" CHECK ("email" = lower("email"));

-- UF com 2 letras maiúsculas.
ALTER TABLE "stores" ADD CONSTRAINT "stores_state_chk" CHECK ("state" IS NULL OR "state" ~ '^[A-Z]{2}$');

-- Link personalizado: expiração posterior à criação; campos coerentes com o status.
ALTER TABLE "patient_upload_links" ADD CONSTRAINT "patient_upload_links_expiry_chk" CHECK ("expires_at" > "created_at");
ALTER TABLE "patient_upload_links" ADD CONSTRAINT "patient_upload_links_used_chk"
  CHECK ("status" <> 'USED' OR "used_at" IS NOT NULL);
ALTER TABLE "patient_upload_links" ADD CONSTRAINT "patient_upload_links_revoked_chk"
  CHECK ("status" <> 'REVOKED' OR "revoked_at" IS NOT NULL);

-- Arquivos: tamanho positivo.
ALTER TABLE "prescription_files" ADD CONSTRAINT "prescription_files_size_chk" CHECK ("size_bytes" > 0);

-- Retenção mínima de 365 dias (PRD §22.3), reforçada no banco.
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_retention_min_chk"
  CHECK ("key" <> 'retention_days' OR (jsonb_typeof("value") = 'number' AND ("value" #>> '{}')::numeric >= 365));

-- =============================================================================
-- AuditLog append-only (PRD §21 RNF-015)
-- Bloqueia UPDATE, DELETE e TRUNCATE para qualquer role, inclusive o dono.
-- Em produção, recomenda-se ainda um role de aplicação sem privilégio de DDL
-- (ver docs/decisions.md D-017).
-- =============================================================================

CREATE FUNCTION "audit_logs_block_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs é append-only: % não permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_logs_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_block_mutation"();

CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_block_mutation"();

-- =============================================================================
-- Parâmetros globais iniciais
-- =============================================================================

INSERT INTO "system_settings" ("key", "value", "updated_at") VALUES
  ('retention_days', '365', CURRENT_TIMESTAMP),
  ('patient_link_default_expiry_days', '7', CURRENT_TIMESTAMP),
  ('patient_link_max_expiry_days', '30', CURRENT_TIMESTAMP);
