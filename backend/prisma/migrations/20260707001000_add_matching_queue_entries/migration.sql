-- CreateEnum
CREATE TYPE "MatchingQueueStatus" AS ENUM ('WAITING', 'MATCHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "matching_queue_entries" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "wakppuball_owned_id" BIGINT NOT NULL,
    "status" "MatchingQueueStatus" NOT NULL DEFAULT 'WAITING',
    "match_history_id" BIGINT,
    "received_wakppuball_id" BIGINT,
    "entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matching_queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matching_queue_entries_user_id_status_entered_at_idx" ON "matching_queue_entries"("user_id", "status", "entered_at");

-- CreateIndex
CREATE INDEX "matching_queue_entries_status_entered_at_idx" ON "matching_queue_entries"("status", "entered_at");
