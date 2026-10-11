-- Group admin controls: constraints Prisma can't express, and admins for existing groups

ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_role_check" CHECK ("role" IN ('admin', 'member'));
-- Removed members have left
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_removed_check" CHECK ("removed_by" IS NULL OR "left_at" IS NOT NULL);

ALTER TABLE "conversation_join_requests" ADD CONSTRAINT "conversation_join_requests_status_check"
  CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled'));
ALTER TABLE "conversation_join_requests" ADD CONSTRAINT "conversation_join_requests_decided_check"
  CHECK (("status" = 'pending') = ("decided_at" IS NULL));
-- One open request per person per group
CREATE UNIQUE INDEX "conversation_join_requests_one_pending"
  ON "conversation_join_requests" ("conversation_id", "user_id") WHERE "status" = 'pending';

-- A decided request is part of the record: only pending rows change, and nothing is deleted
CREATE OR REPLACE FUNCTION birds_join_request_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'conversation_join_requests rows cannot be deleted';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'decided join requests cannot be changed';
  END IF;
  IF NEW.id <> OLD.id OR NEW.conversation_id <> OLD.conversation_id OR NEW.user_id <> OLD.user_id
     OR NEW.requested_by <> OLD.requested_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'only the decision of a join request can be recorded';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_join_requests_guard
  BEFORE UPDATE OR DELETE ON "conversation_join_requests"
  FOR EACH ROW EXECUTE FUNCTION birds_join_request_guard();

-- Existing groups: the creator is admin while still a member, otherwise the longest-standing member
UPDATE "conversation_members" cm SET "role" = 'admin'
  FROM "conversations" c
 WHERE c.id = cm.conversation_id AND c.kind = 'group' AND cm.user_id = c.created_by AND cm.left_at IS NULL;

UPDATE "conversation_members" cm SET "role" = 'admin'
 WHERE cm.left_at IS NULL
   AND (cm.conversation_id, cm.user_id) IN (
     SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.user_id
       FROM "conversation_members" m JOIN "conversations" c ON c.id = m.conversation_id AND c.kind = 'group'
      WHERE m.left_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM "conversation_members" a WHERE a.conversation_id = m.conversation_id AND a.role = 'admin' AND a.left_at IS NULL)
      ORDER BY m.conversation_id, m.joined_at, m.user_id);
