-- DropIndex
DROP INDEX "prescription_files_submission_id_idx";

-- AlterTable
ALTER TABLE "prescription_files" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "prescription_files_submission_id_position_idx" ON "prescription_files"("submission_id", "position");


-- Backfill: posição pela ordem de criação (o melhor dado disponível para registros antigos).
UPDATE "prescription_files" f SET "position" = r.rn
  FROM (SELECT "id", row_number() OVER (PARTITION BY "submission_id" ORDER BY "created_at", "id") AS rn
          FROM "prescription_files") r
 WHERE f."id" = r."id";
