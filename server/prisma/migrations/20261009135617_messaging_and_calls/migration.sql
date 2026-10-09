-- CreateTable
CREATE TABLE "conversations" (
    "id" SERIAL NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "title" VARCHAR(100),
    "direct_key" VARCHAR(25),
    "created_by" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMPTZ,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "conversation_id" INTEGER NOT NULL,
    "user_id" VARCHAR(10) NOT NULL,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ,
    "last_read_id" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "sender_id" VARCHAR(10) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "body" TEXT,
    "voice_path" VARCHAR(500),
    "voice_mime" VARCHAR(100),
    "voice_size" INTEGER,
    "voice_duration_ms" INTEGER,
    "voice_sha256" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" SERIAL NOT NULL,
    "caller_id" VARCHAR(10) NOT NULL,
    "callee_id" VARCHAR(10) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "end_reason" VARCHAR(40),

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_direct_key_key" ON "conversations"("direct_key");

-- CreateIndex
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_idx" ON "conversation_members"("user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_id_idx" ON "messages"("conversation_id", "id");

-- CreateIndex
CREATE INDEX "calls_caller_id_started_at_idx" ON "calls"("caller_id", "started_at");

-- CreateIndex
CREATE INDEX "calls_callee_id_started_at_idx" ON "calls"("callee_id", "started_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_callee_id_fkey" FOREIGN KEY ("callee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written
-- ---------------------------------------------------------------------------
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_kind_check" CHECK ("kind" IN ('direct', 'group'));
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_direct_key_check"
  CHECK (("kind" = 'direct' AND "direct_key" IS NOT NULL) OR ("kind" = 'group' AND "direct_key" IS NULL AND "title" IS NOT NULL));
ALTER TABLE "messages" ADD CONSTRAINT "messages_kind_check" CHECK ("kind" IN ('text', 'voice', 'system'));
ALTER TABLE "messages" ADD CONSTRAINT "messages_content_check"
  CHECK (("kind" = 'voice' AND "voice_path" IS NOT NULL) OR ("kind" <> 'voice' AND "body" IS NOT NULL));
ALTER TABLE "calls" ADD CONSTRAINT "calls_status_check"
  CHECK ("status" IN ('ringing', 'answered', 'ended', 'declined', 'missed', 'cancelled', 'failed'));
ALTER TABLE "calls" ADD CONSTRAINT "calls_parties_check" CHECK ("caller_id" <> "callee_id");

-- Messages are part of the record: append-only, like comments, the timeline and the audit log
CREATE TRIGGER messages_append_only
  BEFORE UPDATE OR DELETE ON "messages"
  FOR EACH ROW EXECUTE FUNCTION birds_forbid_modification();
CREATE TRIGGER messages_no_truncate
  BEFORE TRUNCATE ON "messages"
  FOR EACH STATEMENT EXECUTE FUNCTION birds_forbid_modification();

-- New page "messages", granted to every existing role (editable in Admin > Permissions)
INSERT INTO "role_permissions" ("role", "page_id", "enabled")
SELECT r."name", 'messages', true FROM "roles" r
ON CONFLICT ("role", "page_id") DO NOTHING;
