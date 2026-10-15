-- CreateTable
CREATE TABLE "flash_alerts" (
    "id" SERIAL NOT NULL,
    "reference" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "threat_type" VARCHAR(30) NOT NULL,
    "priority" VARCHAR(10) NOT NULL,
    "subject_name" VARCHAR(200),
    "subject_description" TEXT,
    "details" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "last_seen_at" TIMESTAMPTZ,
    "last_seen_place" VARCHAR(255),
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "target_sectors" TEXT[],
    "incident_id" VARCHAR(30),
    "valid_until" TIMESTAMPTZ NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "declaration_at" TIMESTAMPTZ NOT NULL,
    "created_by" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by" VARCHAR(10),
    "closed_at" TIMESTAMPTZ,
    "close_note" TEXT,

    CONSTRAINT "flash_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flash_alert_attachments" (
    "id" SERIAL NOT NULL,
    "alert_id" INTEGER NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" BIGINT NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "file_metadata" JSONB,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flash_alert_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flash_alert_recipients" (
    "alert_id" INTEGER NOT NULL,
    "user_id" VARCHAR(10) NOT NULL,
    "delivered_at" TIMESTAMPTZ,
    "acknowledged_at" TIMESTAMPTZ,

    CONSTRAINT "flash_alert_recipients_pkey" PRIMARY KEY ("alert_id","user_id")
);

-- CreateTable
CREATE TABLE "flash_alert_updates" (
    "id" SERIAL NOT NULL,
    "alert_id" INTEGER NOT NULL,
    "user_id" VARCHAR(10) NOT NULL,
    "user_name" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(10) NOT NULL DEFAULT 'update',
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flash_alert_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "flash_alerts_reference_key" ON "flash_alerts"("reference");

-- CreateIndex
CREATE INDEX "flash_alerts_status_valid_until_idx" ON "flash_alerts"("status", "valid_until");

-- CreateIndex
CREATE INDEX "flash_alerts_created_at_idx" ON "flash_alerts"("created_at");

-- CreateIndex
CREATE INDEX "flash_alert_attachments_alert_id_idx" ON "flash_alert_attachments"("alert_id");

-- CreateIndex
CREATE INDEX "flash_alert_recipients_user_id_idx" ON "flash_alert_recipients"("user_id");

-- CreateIndex
CREATE INDEX "flash_alert_updates_alert_id_id_idx" ON "flash_alert_updates"("alert_id", "id");

-- AddForeignKey
ALTER TABLE "flash_alerts" ADD CONSTRAINT "flash_alerts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_alerts" ADD CONSTRAINT "flash_alerts_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_alerts" ADD CONSTRAINT "flash_alerts_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_alert_attachments" ADD CONSTRAINT "flash_alert_attachments_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "flash_alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_alert_recipients" ADD CONSTRAINT "flash_alert_recipients_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "flash_alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_alert_recipients" ADD CONSTRAINT "flash_alert_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_alert_updates" ADD CONSTRAINT "flash_alert_updates_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "flash_alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_alert_updates" ADD CONSTRAINT "flash_alert_updates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Flash Alert integrity (hand-written)
-- ---------------------------------------------------------------------------
ALTER TABLE "flash_alerts" ADD CONSTRAINT "flash_alerts_threat_type_check"
  CHECK ("threat_type" IN ('illegal_crossing', 'smuggling', 'armed_group', 'trafficking', 'wanted_person', 'other'));
ALTER TABLE "flash_alerts" ADD CONSTRAINT "flash_alerts_priority_check" CHECK ("priority" IN ('flash', 'immediate'));
ALTER TABLE "flash_alerts" ADD CONSTRAINT "flash_alerts_status_check" CHECK ("status" IN ('active', 'resolved', 'cancelled'));
ALTER TABLE "flash_alerts" ADD CONSTRAINT "flash_alerts_closed_check"
  CHECK (("status" = 'active' AND "closed_at" IS NULL) OR ("status" <> 'active' AND "closed_at" IS NOT NULL AND "closed_by" IS NOT NULL));
ALTER TABLE "flash_alerts" ADD CONSTRAINT "flash_alerts_validity_check" CHECK ("valid_until" > "created_at");
ALTER TABLE "flash_alert_updates" ADD CONSTRAINT "flash_alert_updates_kind_check" CHECK ("kind" IN ('update', 'resolved', 'cancelled'));

-- Updates and attachments are part of the record: append-only, like messages and the timeline
CREATE TRIGGER flash_alert_updates_append_only
  BEFORE UPDATE OR DELETE ON "flash_alert_updates"
  FOR EACH ROW EXECUTE FUNCTION birds_forbid_modification();
CREATE TRIGGER flash_alert_updates_no_truncate
  BEFORE TRUNCATE ON "flash_alert_updates"
  FOR EACH STATEMENT EXECUTE FUNCTION birds_forbid_modification();
CREATE TRIGGER flash_alert_attachments_append_only
  BEFORE UPDATE OR DELETE ON "flash_alert_attachments"
  FOR EACH ROW EXECUTE FUNCTION birds_forbid_modification();
CREATE TRIGGER flash_alert_attachments_no_truncate
  BEFORE TRUNCATE ON "flash_alert_attachments"
  FOR EACH STATEMENT EXECUTE FUNCTION birds_forbid_modification();

-- A delivery or acknowledgement, once recorded, can't be changed or removed; recipients are never deleted
CREATE OR REPLACE FUNCTION birds_flash_recipient_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'flash_alert_recipients rows cannot be deleted';
  END IF;
  IF NEW."alert_id" <> OLD."alert_id" OR NEW."user_id" <> OLD."user_id"
     OR (OLD."delivered_at" IS NOT NULL AND NEW."delivered_at" IS DISTINCT FROM OLD."delivered_at")
     OR (OLD."acknowledged_at" IS NOT NULL AND NEW."acknowledged_at" IS DISTINCT FROM OLD."acknowledged_at") THEN
    RAISE EXCEPTION 'flash_alert_recipients: delivery and acknowledgement are recorded once';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER flash_alert_recipients_guard
  BEFORE UPDATE OR DELETE ON "flash_alert_recipients"
  FOR EACH ROW EXECUTE FUNCTION birds_flash_recipient_guard();

-- New permission "raise_alert" (editable in Admin > Permissions): HQ administrators and sector officers
INSERT INTO "role_permissions" ("role", "page_id", "enabled")
SELECT r."name", 'raise_alert', true FROM "roles" r WHERE r."name" IN ('HQ Administrator', 'Sector Officer')
ON CONFLICT ("role", "page_id") DO NOTHING;
