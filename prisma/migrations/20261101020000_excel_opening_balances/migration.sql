-- Opening snapshots are not receipts: they contribute only to balances.
ALTER TABLE "BankTransaction" DROP CONSTRAINT "BankTransaction_entryStatus_valid";
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_entryStatus_valid" CHECK ("entryStatus" IN ('POSTED','REVIEW','MERGED','OPENING'));
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_opening_snapshot_valid" CHECK ("entryStatus" <> 'OPENING' OR (origin = 'EXCEL' AND assignment = 'MANUAL' AND "fundId" IS NOT NULL AND "importId" IS NOT NULL));
CREATE UNIQUE INDEX "BankTransaction_one_opening_per_fund_account" ON "BankTransaction" ("fundId","accountId") WHERE "entryStatus" = 'OPENING';
