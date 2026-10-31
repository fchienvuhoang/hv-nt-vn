CREATE TABLE "TabReclassification" (
 "id" TEXT NOT NULL PRIMARY KEY, "scopeKey" TEXT NOT NULL, "scope" JSONB NOT NULL, "ruleHash" TEXT NOT NULL,
 "actor" TEXT NOT NULL, "actorId" TEXT, "actorName" TEXT, "status" TEXT NOT NULL DEFAULT 'CHECKING',
 "total" INTEGER NOT NULL DEFAULT 0, "manualProtected" INTEGER NOT NULL DEFAULT 0, "reviewProtected" INTEGER NOT NULL DEFAULT 0,
 "checked" INTEGER NOT NULL DEFAULT 0, "changes" INTEGER NOT NULL DEFAULT 0, "unchanged" INTEGER NOT NULL DEFAULT 0,
 "conflicted" INTEGER NOT NULL DEFAULT 0, "applied" INTEGER NOT NULL DEFAULT 0, "noMatch" INTEGER NOT NULL DEFAULT 0,
 "inactive" INTEGER NOT NULL DEFAULT 0, "ambiguous" INTEGER NOT NULL DEFAULT 0, "error" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "finishedAt" TIMESTAMP(3)
);
CREATE INDEX "TabReclassification_scopeKey_actor_createdAt_idx" ON "TabReclassification"("scopeKey","actor","createdAt");
CREATE TABLE "TabReclassificationItem" (
 "runId" TEXT NOT NULL, "transactionId" TEXT NOT NULL, "beforeFundId" TEXT,
 "beforeAssignment" TEXT NOT NULL, "beforeUpdatedAt" TIMESTAMP(3) NOT NULL,
 "plannedFundId" TEXT, "plannedAssignment" TEXT, "reason" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'PENDING',
 PRIMARY KEY("runId","transactionId"),
 CONSTRAINT "TabReclassificationItem_runId_fkey" FOREIGN KEY("runId") REFERENCES "TabReclassification"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TabReclassificationItem_runId_status_transactionId_idx" ON "TabReclassificationItem"("runId","status","transactionId");
