-- Permit only the explicitly authorized public reconciliation entry.
-- Keep ordinary BANK/EXCEL origin validation; do not disguise this as a bank receipt.
ALTER TABLE "BankTransaction"
 DROP CONSTRAINT "BankTransaction_origin_valid",
 ADD CONSTRAINT "BankTransaction_origin_valid" CHECK (
  origin IN ('BANK','EXCEL') OR (
   origin = 'RECONCILIATION'
   AND id = 'chat-reconciliation-quytambao-0572-20261120-14600000-visible'
   AND "sourceId" = 'chat-reconciliation-quytambao-0572-20261120-14600000-visible'
   AND "accountId" = 'cmvw2f3kh00000or3r3fgruqs'
   AND "fundId" IS NOT NULL AND "fundId" = 'cmvx7um70000o07jvxskua7u0'
   AND amount = 14600000 AND direction = 'CREDIT'
   AND "entryStatus" = 'POSTED' AND assignment = 'MANUAL'
  )
 );
