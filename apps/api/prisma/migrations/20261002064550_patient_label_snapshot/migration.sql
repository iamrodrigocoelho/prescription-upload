-- AlterTable
ALTER TABLE "prescription_submissions" ADD COLUMN     "patient_label_captured_at" TIMESTAMPTZ(3);


-- Backfill: rótulos existentes vieram do link personalizado (capturados na criação do link).
UPDATE "prescription_submissions" s
SET "patient_label_captured_at" = l."created_at"
FROM "patient_upload_links" l
WHERE s."patient_upload_link_id" = l."id" AND s."patient_display_label" IS NOT NULL;
