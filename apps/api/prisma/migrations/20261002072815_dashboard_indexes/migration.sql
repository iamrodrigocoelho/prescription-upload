-- CreateIndex
CREATE INDEX "patient_upload_links_store_id_status_expires_at_idx" ON "patient_upload_links"("store_id", "status", "expires_at");


-- Dashboard (D-077): finalizações por dia (série temporal). Índice parcial, fora do schema Prisma.
CREATE INDEX "status_history_finished_idx" ON "status_history" ("created_at") WHERE "to_status" = 'FINISHED';
