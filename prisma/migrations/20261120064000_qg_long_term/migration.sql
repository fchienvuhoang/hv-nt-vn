BEGIN;
WITH changed AS (
 UPDATE "Fund" SET "isLongTerm" = true, "updatedAt" = CURRENT_TIMESTAMP,
  "updatedById" = 'system:user-request', "updatedByName" = 'Chuyển QG sang dài hạn theo yêu cầu người dùng'
 WHERE "code" = 'QG' AND "isLongTerm" = false
 RETURNING "id", "code", "name"
)
INSERT INTO "AuditLog" ("id", "action", "entityId", "actor", "actorId", "actorName", "details", "createdAt")
 SELECT 'qg-long-term-20261120-' || "id", 'FUND_UPDATED', "id", 'system:user-request',
  'system:user-request', 'Theo yêu cầu người dùng',
  jsonb_build_object('code', "code", 'name', "name", 'before', jsonb_build_object('isLongTerm', false), 'after', jsonb_build_object('isLongTerm', true)), CURRENT_TIMESTAMP
 FROM changed;
COMMIT;
