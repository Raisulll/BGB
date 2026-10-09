-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" SERIAL NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "page_id" VARCHAR(50) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(10) NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "last_login" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_hierarchy" (
    "id" SERIAL NOT NULL,
    "hq" VARCHAR(50) NOT NULL DEFAULT 'HQ',
    "sector" VARCHAR(50) NOT NULL,
    "battalion" VARCHAR(50) NOT NULL,
    "bop" VARCHAR(100) NOT NULL,

    CONSTRAINT "org_hierarchy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_categories" (
    "id" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "incident_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_subcategories" (
    "id" SERIAL NOT NULL,
    "category_id" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "incident_subcategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" VARCHAR(30) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "subcategory" VARCHAR(100),
    "severity" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "incident_date" DATE NOT NULL,
    "incident_time" TIME(0) NOT NULL,
    "location" VARCHAR(255),
    "bop" VARCHAR(100),
    "sector" VARCHAR(50),
    "battalion" VARCHAR(50),
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "description" TEXT NOT NULL,
    "persons_involved" TEXT,
    "action_taken" TEXT,
    "outcome" TEXT,
    "created_by" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_timeline" (
    "id" SERIAL NOT NULL,
    "incident_id" VARCHAR(30) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "user_name" VARCHAR(100) NOT NULL,
    "user_id" VARCHAR(10),
    "status" VARCHAR(20) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" SERIAL NOT NULL,
    "incident_id" VARCHAR(30) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" BIGINT NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "file_metadata" JSONB,
    "uploaded_by" VARCHAR(10),
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "seq" BIGINT,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" VARCHAR(10),
    "username" VARCHAR(50) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "details" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "prev_hash" VARCHAR(64),
    "row_hash" VARCHAR(64),

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(10),
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "type" VARCHAR(50),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "incident_id" VARCHAR(30),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_by" VARCHAR(10),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(10) NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "previous_token_hash" VARCHAR(255),
    "rotated_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_reason" VARCHAR(50),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_page_id_key" ON "role_permissions"("role", "page_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "org_hierarchy_sector_battalion_bop_key" ON "org_hierarchy"("sector", "battalion", "bop");

-- CreateIndex
CREATE UNIQUE INDEX "incident_categories_name_key" ON "incident_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "incident_subcategories_category_id_name_key" ON "incident_subcategories"("category_id", "name");

-- CreateIndex
CREATE INDEX "idx_incidents_status" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "idx_incidents_sector" ON "incidents"("sector");

-- CreateIndex
CREATE INDEX "idx_incidents_date" ON "incidents"("incident_date");

-- CreateIndex
CREATE INDEX "idx_incidents_category" ON "incidents"("category");

-- CreateIndex
CREATE INDEX "idx_incidents_sector_status" ON "incidents"("sector", "status");

-- CreateIndex
CREATE INDEX "idx_incidents_creator_status" ON "incidents"("created_by", "status");

-- CreateIndex
CREATE INDEX "incident_timeline_incident_id_created_at_idx" ON "incident_timeline"("incident_id", "created_at");

-- CreateIndex
CREATE INDEX "evidence_incident_id_idx" ON "evidence"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_seq_key" ON "audit_log"("seq");

-- CreateIndex
CREATE INDEX "audit_log_timestamp_idx" ON "audit_log"("timestamp");

-- CreateIndex
CREATE INDEX "audit_log_username_idx" ON "audit_log"("username");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_idx" ON "refresh_tokens"("user_id", "revoked");

-- CreateIndex
CREATE INDEX "refresh_tokens_previous_token_hash_idx" ON "refresh_tokens"("previous_token_hash");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_fkey" FOREIGN KEY ("role") REFERENCES "roles"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_fkey" FOREIGN KEY ("role") REFERENCES "roles"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_subcategories" ADD CONSTRAINT "incident_subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "incident_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_timeline" ADD CONSTRAINT "incident_timeline_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_timeline" ADD CONSTRAINT "incident_timeline_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config" ADD CONSTRAINT "system_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===== Hand-written integrity layer: source prisma/sql/integrity.sql =====
-- BIRDS data-integrity layer (specs #12, #24, #25). Appended to the init migration.
-- Things Prisma's schema language cannot express live here.

-- ---------------------------------------------------------------------------
-- Domain constraints (§17.6)
-- ---------------------------------------------------------------------------
ALTER TABLE incidents
  ADD CONSTRAINT incidents_severity_check
    CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  ADD CONSTRAINT incidents_status_check
    CHECK (status IN ('Draft', 'Submitted', 'Reviewed', 'Verified', 'Approved', 'Closed', 'Returned', 'Rejected')),
  ADD CONSTRAINT incidents_lat_check CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  ADD CONSTRAINT incidents_lng_check CHECK (lng IS NULL OR lng BETWEEN -180 AND 180);

-- ---------------------------------------------------------------------------
-- Append-only guard, shared by audit_log and incident_timeline.
-- A trigger that raises (rather than a RULE that silently does nothing) makes
-- tampering attempts visible to the caller and to the DB logs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION birds_forbid_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'BIRDS: % on % is not permitted (append-only table)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER incident_timeline_append_only
  BEFORE UPDATE OR DELETE ON incident_timeline
  FOR EACH ROW EXECUTE FUNCTION birds_forbid_modification();
CREATE TRIGGER incident_timeline_no_truncate
  BEFORE TRUNCATE ON incident_timeline
  FOR EACH STATEMENT EXECUTE FUNCTION birds_forbid_modification();

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION birds_forbid_modification();
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION birds_forbid_modification();

-- ---------------------------------------------------------------------------
-- Audit hash chain (§17.9, DOUBT-005).
-- row_hash = SHA-256(prev_hash | seq | timestamp(UTC) | user_id | username | action | details | ip)
-- seq is assigned under an advisory lock so the chain order is total even
-- under concurrent inserts. A superuser who disables the triggers and edits a
-- row breaks the chain, which audit_log_verify() detects.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_log_hash(
  p_prev TEXT, p_seq BIGINT, p_ts TIMESTAMPTZ, p_user_id TEXT, p_username TEXT,
  p_action TEXT, p_details TEXT, p_ip INET
) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    p_prev,
    p_seq::text,
    to_char(p_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(p_user_id, ''),
    p_username,
    p_action,
    coalesce(p_details, ''),
    coalesce(host(p_ip), '')
  ), 'UTF8')), 'hex');
$$;

CREATE OR REPLACE FUNCTION audit_log_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  last_seq  BIGINT;
  last_hash TEXT;
BEGIN
  -- Serialise chain extension; released at transaction end.
  PERFORM pg_advisory_xact_lock(hashtext('birds.audit_log.chain'));
  SELECT seq, row_hash INTO last_seq, last_hash FROM audit_log ORDER BY seq DESC LIMIT 1;
  NEW.seq       := coalesce(last_seq, 0) + 1;
  NEW.prev_hash := coalesce(last_hash, repeat('0', 64));
  NEW.row_hash  := audit_log_hash(NEW.prev_hash, NEW.seq, NEW.timestamp, NEW.user_id,
                                  NEW.username, NEW.action, NEW.details, NEW.ip_address);
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_log_hash_chain
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_chain();

-- Walks the chain in seq order. Returns the number of rows checked and the
-- first seq whose hash or back-link does not match (NULL when intact).
CREATE OR REPLACE FUNCTION audit_log_verify()
RETURNS TABLE (rows_checked BIGINT, first_broken_seq BIGINT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r         RECORD;
  expected  TEXT := repeat('0', 64);
  n         BIGINT := 0;
BEGIN
  FOR r IN SELECT * FROM audit_log ORDER BY seq LOOP
    n := n + 1;
    IF r.seq <> n
       OR r.prev_hash IS DISTINCT FROM expected
       OR r.row_hash IS DISTINCT FROM audit_log_hash(r.prev_hash, r.seq, r.timestamp, r.user_id,
                                                     r.username, r.action, r.details, r.ip_address) THEN
      rows_checked := n; first_broken_seq := r.seq;
      RETURN NEXT; RETURN;
    END IF;
    expected := r.row_hash;
  END LOOP;
  rows_checked := n; first_broken_seq := NULL;
  RETURN NEXT;
END;
$$;
