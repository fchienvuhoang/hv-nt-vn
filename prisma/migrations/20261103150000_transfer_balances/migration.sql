CREATE TABLE "TransferBalanceItem" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "transferId" TEXT NOT NULL REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "accountId" TEXT NOT NULL,
 "accountNumber" TEXT NOT NULL,
 "amount" BIGINT NOT NULL CHECK ("amount" > 0),
 "sourceBefore" BIGINT NOT NULL,
 "sourceAfter" BIGINT NOT NULL CHECK ("sourceAfter" >= 0),
 "destinationBefore" BIGINT NOT NULL,
 "destinationAfter" BIGINT NOT NULL
);
CREATE UNIQUE INDEX "TransferBalanceItem_transferId_accountId_key" ON "TransferBalanceItem"("transferId","accountId");
CREATE INDEX "TransferBalanceItem_accountId_idx" ON "TransferBalanceItem"("accountId");
