-- Call history in the chat: every finished call is also a 'call' entry in the direct
-- conversation between the two people, linked to its call record (one entry per call).
ALTER TABLE "messages" ADD COLUMN "call_id" INTEGER;
CREATE UNIQUE INDEX "messages_call_id_key" ON "messages"("call_id");
ALTER TABLE "messages" ADD CONSTRAINT "messages_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written
ALTER TABLE "messages" DROP CONSTRAINT "messages_kind_check";
ALTER TABLE "messages" ADD CONSTRAINT "messages_kind_check" CHECK ("kind" IN ('text', 'voice', 'system', 'call'));
ALTER TABLE "messages" ADD CONSTRAINT "messages_call_check" CHECK (("kind" = 'call') = ("call_id" IS NOT NULL));
