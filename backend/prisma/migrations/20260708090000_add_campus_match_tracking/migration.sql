-- Campus geofence matching moves from a blocking requirement to a cosmetic
-- signal: a match only earns the "on-campus exchange" badge (nubzuki icon,
-- frontend) when both sides' location checks passed. These columns default
-- to false, which is exactly correct for historical rows too (they were
-- created under the old always-required-and-verified regime, but we have no
-- reliable way to retroactively distinguish which historical matches would
-- still count under the new both-sides rule, so they simply don't carry the
-- badge going forward).
ALTER TABLE "matching_queue_entries" ADD COLUMN "location_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_wakppuballs" ADD COLUMN "is_campus_match" BOOLEAN NOT NULL DEFAULT false;
