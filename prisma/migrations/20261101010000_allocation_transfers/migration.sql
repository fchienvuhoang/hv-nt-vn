ALTER TABLE "Transfer" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'BALANCE', ADD COLUMN "targetIncome" BIGINT, ADD COLUMN "requestKey" TEXT NOT NULL DEFAULT '', ADD COLUMN "planFingerprint" TEXT NOT NULL DEFAULT '';
CREATE TABLE "FundAllocation" (
 "id" TEXT PRIMARY KEY, "transactionId" TEXT NOT NULL REFERENCES "BankTransaction"("id") ON DELETE CASCADE,
 "fundId" TEXT NOT NULL REFERENCES "Fund"("id"), "accountId" TEXT NOT NULL,
 "amount" BIGINT NOT NULL CHECK ("amount">0), UNIQUE("transactionId","fundId")
);
CREATE INDEX "FundAllocation_fundId_accountId_idx" ON "FundAllocation"("fundId","accountId");
CREATE TABLE "TransferItem" (
 "id" TEXT PRIMARY KEY, "transferId" TEXT NOT NULL REFERENCES "Transfer"("id") ON DELETE CASCADE,
 "transactionId" TEXT NOT NULL REFERENCES "BankTransaction"("id"), "amount" BIGINT NOT NULL CHECK("amount">0),
 "originalAmount" BIGINT NOT NULL, "sourceBefore" BIGINT NOT NULL, "sourceAfter" BIGINT NOT NULL,
 "destinationBefore" BIGINT NOT NULL, "destinationAfter" BIGINT NOT NULL, "snapshot" JSONB NOT NULL,
 UNIQUE("transferId","transactionId")
);
CREATE INDEX "TransferItem_transactionId_idx" ON "TransferItem"("transactionId");
