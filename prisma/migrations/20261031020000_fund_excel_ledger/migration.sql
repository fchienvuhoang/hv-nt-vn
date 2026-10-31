-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN     "syncFrom" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "entryStatus" TEXT NOT NULL DEFAULT 'POSTED',
ADD COLUMN     "importId" TEXT,
ADD COLUMN     "matchKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'BANK';

-- CreateTable
CREATE TABLE "FundImport" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STAGED',
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "rowCount" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "review" INTEGER NOT NULL DEFAULT 0,
    "income" BIGINT NOT NULL,
    "expense" BIGINT NOT NULL,
    "sourceIncome" BIGINT,
    "sourceExpense" BIGINT,
    "sample" JSONB NOT NULL,
    "errors" JSONB NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundImport_fundId_createdAt_idx" ON "FundImport"("fundId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FundImport_fundId_fileHash_sheetName_key" ON "FundImport"("fundId", "fileHash", "sheetName");

-- CreateIndex
CREATE INDEX "BankTransaction_accountId_origin_entryStatus_occurredAt_idx" ON "BankTransaction"("accountId", "origin", "entryStatus", "occurredAt");

-- CreateIndex
CREATE INDEX "BankTransaction_accountId_matchKey_idx" ON "BankTransaction"("accountId", "matchKey");

-- CreateIndex
CREATE INDEX "BankTransaction_importId_idx" ON "BankTransaction"("importId");

-- CreateIndex
CREATE INDEX "BankTransaction_mergedIntoId_idx" ON "BankTransaction"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FundImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundImport" ADD CONSTRAINT "FundImport_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Preserve the previous synchronization start, but remove all closing gates in the app.
UPDATE "BankAccount" SET "syncFrom" = "cutoverAt" WHERE "cutoverAt" IS NOT NULL;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_origin_valid" CHECK (origin IN ('BANK','EXCEL'));
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_entryStatus_valid" CHECK ("entryStatus" IN ('POSTED','REVIEW','MERGED'));
