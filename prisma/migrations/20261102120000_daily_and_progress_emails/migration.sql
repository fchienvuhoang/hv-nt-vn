ALTER TABLE "FundGoalAchievement" ADD COLUMN "milestone" INTEGER NOT NULL DEFAULT 100;
CREATE TABLE "DailyReportSchedule" ("id" TEXT NOT NULL PRIMARY KEY,"activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO "DailyReportSchedule" ("id") VALUES ('morning-7h');
CREATE TABLE "DailyReport" ("date" TEXT NOT NULL PRIMARY KEY,"subject" TEXT NOT NULL,"text" TEXT NOT NULL,"html" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "DailyReportEmail" (
 "id" TEXT NOT NULL PRIMARY KEY,"reportDate" TEXT NOT NULL REFERENCES "DailyReport"("date") ON DELETE CASCADE ON UPDATE CASCADE,"email" TEXT NOT NULL,
 "attempts" INTEGER NOT NULL DEFAULT 0,"nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"firstAttemptAt" TIMESTAMP(3),"finishedAt" TIMESTAMP(3),"lastError" TEXT
);
CREATE UNIQUE INDEX "DailyReportEmail_reportDate_email_key" ON "DailyReportEmail"("reportDate","email");
CREATE INDEX "DailyReportEmail_finishedAt_nextAttemptAt_idx" ON "DailyReportEmail"("finishedAt","nextAttemptAt");
