-- One charity code is shared by every configured bank account. Preserve the
-- primary account for legacy summaries; never change transaction account IDs.
UPDATE "Fund" AS f SET "accountIds" = ARRAY(
  SELECT a.id FROM "BankAccount" AS a WHERE a.id <> f."accountId" ORDER BY a.number
);
CREATE UNIQUE INDEX "Fund_code_key" ON "Fund"("code");
