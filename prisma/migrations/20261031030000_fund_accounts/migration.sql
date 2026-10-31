-- AlterTable
ALTER TABLE "Fund" ADD COLUMN     "accountIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "FundImport" ADD COLUMN     "accountId" TEXT;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "accountId" TEXT;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundImport" ADD CONSTRAINT "FundImport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;


UPDATE "FundImport" AS i SET "accountId" = f."accountId" FROM "Fund" AS f WHERE i."fundId" = f.id AND i."accountId" IS NULL;
UPDATE "Transfer" AS t SET "accountId" = f."accountId" FROM "Fund" AS f WHERE t."fromFundId" = f.id AND t."accountId" IS NULL;
