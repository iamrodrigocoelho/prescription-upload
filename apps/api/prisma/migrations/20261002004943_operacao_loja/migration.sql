-- CreateEnum
CREATE TYPE "FileProcessingStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- AlterEnum
ALTER TYPE "MalwareScanStatus" ADD VALUE 'NOT_SCANNED';

-- DropIndex
DROP INDEX "prescription_submissions_store_id_created_at_idx";

-- DropIndex
DROP INDEX "prescription_submissions_store_id_operational_status_idx";

-- AlterTable
ALTER TABLE "prescription_files" ADD COLUMN     "preview_mime_type" VARCHAR(100),
ADD COLUMN     "preview_storage_key" VARCHAR(512),
ADD COLUMN     "processing_error_code" VARCHAR(60),
ADD COLUMN     "processing_status" "FileProcessingStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "thumbnail_storage_key" VARCHAR(512);

-- AlterTable
ALTER TABLE "prescription_submissions" ADD COLUMN     "patient_display_label" VARCHAR(200),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notification_sound_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prescription_files_preview_storage_key_key" ON "prescription_files"("preview_storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "prescription_files_thumbnail_storage_key_key" ON "prescription_files"("thumbnail_storage_key");

-- CreateIndex
CREATE INDEX "prescription_submissions_store_id_created_at_id_idx" ON "prescription_submissions"("store_id", "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "prescription_submissions_store_id_operational_status_create_idx" ON "prescription_submissions"("store_id", "operational_status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "prescription_submissions_store_id_identification_status_cre_idx" ON "prescription_submissions"("store_id", "identification_status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "prescription_submissions_created_at_id_idx" ON "prescription_submissions"("created_at" DESC, "id");


-- Índice parcial para "novas/não visualizadas" (fila, contadores e badge).
CREATE INDEX "prescription_submissions_unviewed_idx"
  ON "prescription_submissions" ("store_id", "created_at" DESC)
  WHERE "first_viewed_at" IS NULL;

-- Outbox pendente.
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" ("created_at") WHERE "processed_at" IS NULL;

-- Backfill: rótulo mascarado do paciente para envios por link personalizado.
UPDATE "prescription_submissions" s
   SET "patient_display_label" = l."patient_display_label"
  FROM "patient_upload_links" l
 WHERE s."patient_upload_link_id" = l."id" AND s."patient_display_label" IS NULL;
