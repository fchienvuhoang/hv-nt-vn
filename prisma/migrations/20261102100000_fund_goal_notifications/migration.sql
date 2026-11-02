ALTER TABLE "PushPreference" ADD COLUMN "fundGoalReached" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "FundGoalAchievement" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "fundId" TEXT NOT NULL,
 "goalAmount" BIGINT NOT NULL,
 "income" BIGINT NOT NULL,
 "code" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "slug" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "FundGoalEmail" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "achievementId" TEXT NOT NULL REFERENCES "FundGoalAchievement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "email" TEXT NOT NULL,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "firstAttemptAt" TIMESTAMP(3),
 "finishedAt" TIMESTAMP(3),
 "lastError" TEXT
);
CREATE UNIQUE INDEX "FundGoalEmail_achievementId_email_key" ON "FundGoalEmail"("achievementId", "email");
CREATE INDEX "FundGoalEmail_finishedAt_nextAttemptAt_idx" ON "FundGoalEmail"("finishedAt", "nextAttemptAt");
