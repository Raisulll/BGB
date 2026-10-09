-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "status_changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "incident_comments" (
    "id" SERIAL NOT NULL,
    "incident_id" VARCHAR(30) NOT NULL,
    "user_id" VARCHAR(10) NOT NULL,
    "user_name" VARCHAR(100) NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_comments_incident_id_created_at_idx" ON "incident_comments"("incident_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_incidents_status_since" ON "incidents"("status", "status_changed_at");

-- AddForeignKey
ALTER TABLE "incident_comments" ADD CONSTRAINT "incident_comments_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_comments" ADD CONSTRAINT "incident_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma can't express these)
-- ---------------------------------------------------------------------------

-- Backfill: the current status began at the first timeline entry with that status after the last
-- entry with a different one (edits and evidence entries keep the status, so they don't reset it)
UPDATE "incidents" i
SET "status_changed_at" = COALESCE(
  (SELECT min(t."created_at") FROM "incident_timeline" t
    WHERE t."incident_id" = i."id" AND t."status" = i."status"
      AND t."created_at" > COALESCE(
        (SELECT max(t2."created_at") FROM "incident_timeline" t2 WHERE t2."incident_id" = i."id" AND t2."status" <> i."status"),
        '-infinity'::timestamptz)),
  i."created_at");

-- Every status change stamps the time, whichever code path made it
CREATE OR REPLACE FUNCTION birds_stamp_status_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    NEW."status_changed_at" := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER incidents_status_changed_at
  BEFORE UPDATE OF "status" ON "incidents"
  FOR EACH ROW EXECUTE FUNCTION birds_stamp_status_change();

-- Comments are part of the record: append-only, like the timeline and the audit log (spec #25)
CREATE TRIGGER incident_comments_append_only
  BEFORE UPDATE OR DELETE ON "incident_comments"
  FOR EACH ROW EXECUTE FUNCTION birds_forbid_modification();
CREATE TRIGGER incident_comments_no_truncate
  BEFORE TRUNCATE ON "incident_comments"
  FOR EACH STATEMENT EXECUTE FUNCTION birds_forbid_modification();
