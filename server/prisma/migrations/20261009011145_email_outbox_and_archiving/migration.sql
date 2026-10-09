-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "archived_at" TIMESTAMPTZ,
ADD COLUMN     "archived_by" VARCHAR(10);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" SERIAL NOT NULL,
    "to_user_id" VARCHAR(10),
    "to_email" VARCHAR(150) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "body_text" TEXT NOT NULL,
    "event" VARCHAR(30) NOT NULL,
    "incident_id" VARCHAR(30),
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_email_outbox_due" ON "email_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "idx_incidents_archived" ON "incidents"("archived_at");

-- Hand-written integrity rules (Prisma can't express CHECK constraints)
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_status_check" CHECK ("status" IN ('pending', 'sent', 'failed'));
-- Spec #45 — only final records can be archived
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_archive_final_check" CHECK ("archived_at" IS NULL OR "status" IN ('Closed', 'Rejected'));
