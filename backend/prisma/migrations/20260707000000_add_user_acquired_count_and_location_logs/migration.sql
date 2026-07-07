-- AlterTable
ALTER TABLE "users" ADD COLUMN "total_acquired_count" INTEGER NOT NULL DEFAULT 0;

-- Backfill lifetime acquired count from existing ownership rows.
UPDATE "users"
SET "total_acquired_count" = COALESCE(owned_counts."count", 0)
FROM (
    SELECT "owner_user_id", COUNT(*)::INTEGER AS "count"
    FROM "user_wakppuballs"
    GROUP BY "owner_user_id"
) AS owned_counts
WHERE "users"."id" = owned_counts."owner_user_id";

-- CreateTable
CREATE TABLE "location_verification_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_verification_logs_user_id_checked_at_idx" ON "location_verification_logs"("user_id", "checked_at");

-- AddForeignKey
ALTER TABLE "location_verification_logs" ADD CONSTRAINT "location_verification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
