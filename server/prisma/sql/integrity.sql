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
