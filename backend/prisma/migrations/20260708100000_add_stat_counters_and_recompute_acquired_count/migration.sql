-- New lifetime counters for the leaderboard/tier feature.
ALTER TABLE "users" ADD COLUMN "total_break_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "distinct_matched_user_count" INTEGER NOT NULL DEFAULT 0;

-- Backfill distinct_matched_user_count: one row already exists per distinct
-- partner ever matched with, thanks to the pre-existing unique index on
-- (owner_user_id, acquired_from_user_id) and the fact matched balls are
-- refilled in place, never duplicated or deleted.
UPDATE "users" u
SET "distinct_matched_user_count" = (
  SELECT COUNT(*)
  FROM "user_wakppuballs" w
  WHERE w."owner_user_id" = u.id
    AND w."acquired_from_user_id" IS NOT NULL
);

-- total_acquired_count is being redefined from "created + matched" to
-- "matched only" (application code change lands in the same PR as this
-- migration, so values don't immediately start drifting again). Recompute
-- it as an exact match-count: one match_history row credits both sides +1
-- today, which is exactly what "matched only" means.
UPDATE "users" u
SET "total_acquired_count" = (
  SELECT COUNT(*)
  FROM "match_history" m
  WHERE m."user_a_id" = u.id OR m."user_b_id" = u.id
);
