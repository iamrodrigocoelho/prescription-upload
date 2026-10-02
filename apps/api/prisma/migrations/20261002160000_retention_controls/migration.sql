ALTER TABLE "prescription_submissions"
  ADD COLUMN "legal_hold_at" TIMESTAMPTZ(3),
  ADD COLUMN "legal_hold_by_user_id" UUID,
  ADD COLUMN "disposal_started_at" TIMESTAMPTZ(3),
  ADD COLUMN "disposed_at" TIMESTAMPTZ(3);

CREATE INDEX "prescription_submissions_retention_until_disposed_at_legal_hold_at_idx"
  ON "prescription_submissions"("retention_until", "disposed_at", "legal_hold_at");
