BEGIN;
-- Metre targets use a price per linear metre. Width is descriptive only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Fund"
    WHERE "goalType" = 'LENGTH' AND "goalConfig"->>'version' = '1'
      AND ceil(("goalConfig"->>'unitPrice')::numeric * ("goalConfig"->>'quantity')::numeric) > 999999999999999
  ) THEN
    RAISE EXCEPTION 'Linear metre goal exceeds the supported VND limit; review the target before migrating';
  END IF;
END $$;
WITH corrected AS (
  UPDATE "Fund"
  SET "goalAmount" = ceil(("goalConfig"->>'unitPrice')::numeric * ("goalConfig"->>'quantity')::numeric)::bigint,
      "goalConfig" = jsonb_set("goalConfig", '{version}', '2'::jsonb),
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "goalType" = 'LENGTH' AND "goalConfig"->>'version' = '1'
  RETURNING id
)
INSERT INTO "PublicCacheRefresh" ("fundId", "requestedVersion", "builtVersion", "requestedAt", "dailyKey", "lastSlug")
SELECT id, 1, 0, CURRENT_TIMESTAMP, '', '' FROM corrected
ON CONFLICT ("fundId") DO UPDATE
SET "requestedVersion" = "PublicCacheRefresh"."requestedVersion" + 1, "requestedAt" = CURRENT_TIMESTAMP;
COMMIT;
