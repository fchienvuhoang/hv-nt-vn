CREATE TABLE "SyncInvocation" (
 "id" TEXT NOT NULL PRIMARY KEY, "status" TEXT NOT NULL DEFAULT 'RECEIVED',
 "quickPages" INTEGER NOT NULL DEFAULT 0, "fullPages" INTEGER NOT NULL DEFAULT 0,
 "inserted" INTEGER NOT NULL DEFAULT 0, "updated" INTEGER NOT NULL DEFAULT 0,
 "jobIds" TEXT[] DEFAULT ARRAY[]::TEXT[], "error" TEXT,
 "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3)
);
CREATE INDEX "SyncInvocation_receivedAt_idx" ON "SyncInvocation"("receivedAt");
CREATE INDEX "SyncInvocation_status_receivedAt_idx" ON "SyncInvocation"("status", "receivedAt");
CREATE TABLE "SyncJob" (
 "id" TEXT NOT NULL PRIMARY KEY, "slotKey" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "targetDate" TEXT NOT NULL, "scheduledAt" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUEUED', "progress" JSONB NOT NULL,
 "calls" INTEGER NOT NULL DEFAULT 0, "pages" INTEGER NOT NULL DEFAULT 0,
 "inserted" INTEGER NOT NULL DEFAULT 0, "updated" INTEGER NOT NULL DEFAULT 0,
 "error" TEXT, "startedAt" TIMESTAMP(3), "lastCalledAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "SyncJob_slotKey_key" ON "SyncJob"("slotKey");
CREATE INDEX "SyncJob_kind_status_scheduledAt_idx" ON "SyncJob"("kind", "status", "scheduledAt");
