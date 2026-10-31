ALTER TABLE "AuditLog" ADD COLUMN "actorId" TEXT, ADD COLUMN "actorName" TEXT;
ALTER TABLE "Transfer" ADD COLUMN "actorId" TEXT, ADD COLUMN "actorName" TEXT;
ALTER TABLE "SyncRun" ADD COLUMN "actorId" TEXT, ADD COLUMN "actorName" TEXT;
ALTER TABLE "FundImport" ADD COLUMN "actorId" TEXT, ADD COLUMN "actorName" TEXT;
ALTER TABLE "Fund" ADD COLUMN "createdById" TEXT, ADD COLUMN "createdByName" TEXT, ADD COLUMN "updatedById" TEXT, ADD COLUMN "updatedByName" TEXT;
ALTER TABLE "BankTransaction" ADD COLUMN "createdById" TEXT, ADD COLUMN "createdByName" TEXT, ADD COLUMN "updatedById" TEXT, ADD COLUMN "updatedByName" TEXT;
-- Older rows retain NULL identity rather than inventing historical authors.
