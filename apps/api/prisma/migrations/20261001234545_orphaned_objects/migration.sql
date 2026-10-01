-- CreateTable
CREATE TABLE "orphaned_objects" (
    "id" UUID NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "reason" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "orphaned_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orphaned_objects_resolved_at_idx" ON "orphaned_objects"("resolved_at");
