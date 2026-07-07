-- Merge duplicate MATCHED wakppuballs per (owner, source-user) pair before
-- enforcing uniqueness below: prefer the copy currently set as main,
-- otherwise the most recently acquired one; delete the rest. This backfills
-- the fix in matching.routes.ts, which used to create a new row on every
-- match with the same partner instead of refilling the existing one.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY owner_user_id, acquired_from_user_id
      ORDER BY is_main DESC, acquired_at DESC, id DESC
    ) AS rn
  FROM user_wakppuballs
  WHERE acquired_from_user_id IS NOT NULL
)
DELETE FROM user_wakppuballs
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- One collection slot per partner: re-matching the same user refills the
-- existing row instead of creating a new one (NULL acquired_from_user_id,
-- i.e. self-created balls, are unaffected -- Postgres treats each NULL as
-- distinct in a unique index).
CREATE UNIQUE INDEX "user_wakppuballs_owner_user_id_acquired_from_user_id_key"
ON "user_wakppuballs" ("owner_user_id", "acquired_from_user_id");
