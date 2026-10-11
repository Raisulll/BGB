-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN     "removed_by" VARCHAR(10),
ADD COLUMN     "role" VARCHAR(10) NOT NULL DEFAULT 'member';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "cover_mime" VARCHAR(50),
ADD COLUMN     "cover_path" VARCHAR(500),
ADD COLUMN     "cover_sha256" VARCHAR(64),
ADD COLUMN     "cover_updated_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "conversation_id" INTEGER;

-- CreateTable
CREATE TABLE "conversation_join_requests" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "user_id" VARCHAR(10) NOT NULL,
    "requested_by" VARCHAR(10) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" VARCHAR(10),
    "decided_at" TIMESTAMPTZ,

    CONSTRAINT "conversation_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_join_requests_conversation_id_status_idx" ON "conversation_join_requests"("conversation_id", "status");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_join_requests" ADD CONSTRAINT "conversation_join_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_join_requests" ADD CONSTRAINT "conversation_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_join_requests" ADD CONSTRAINT "conversation_join_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_join_requests" ADD CONSTRAINT "conversation_join_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
