-- CreateEnum
CREATE TYPE "StatusReason" AS ENUM ('ISSUE_DATE_EXPIRED', 'CRM_ILLEGIBLE', 'MEDICATION_NOT_LISTED', 'CONTENT_ILLEGIBLE', 'MISSING_SIGNATURE_STAMP', 'INCOMPLETE_FILE', 'DIFFERENT_PATIENT', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OperationalStatus" ADD VALUE 'APPROVED';
ALTER TYPE "OperationalStatus" ADD VALUE 'REJECTED';
ALTER TYPE "OperationalStatus" ADD VALUE 'RESUBMISSION_REQUESTED';

-- AlterTable
ALTER TABLE "status_history" ADD COLUMN     "reason_note" VARCHAR(200),
ADD COLUMN     "reasons" "StatusReason"[] DEFAULT ARRAY[]::"StatusReason"[];

-- Regras dos motivos (D-087), também garantidas no banco. Usa ::text porque um
-- valor novo de enum não pode ser usado na mesma transação em que foi criado.
-- NOT NULL fica no CHECK (não na coluna) para não divergir do schema do Prisma.
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_reasons_check" CHECK (
  "reasons" IS NOT NULL AND CASE WHEN "to_status"::text IN ('REJECTED', 'RESUBMISSION_REQUESTED')
       THEN cardinality("reasons") >= 1
       ELSE cardinality("reasons") = 0 END
);
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_reason_note_check" CHECK (
  ("reason_note" IS NULL) = NOT ('OTHER' = ANY ("reasons"))
);
