-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "discarded_at" TIMESTAMPTZ,
ADD COLUMN     "discarded_by" VARCHAR(10);

-- Only a never-submitted Draft can be discarded; a discarded record can't move on through the workflow
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_discard_draft_check" CHECK ("discarded_at" IS NULL OR "status" = 'Draft');
