-- Explicit user request: QUYTAMBAO -> TP54, 22,891,463 VND; source may be negative.
-- Only this fixed operation is exempted; normal transfer checks remain intact.
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_quytambao_tp54_exception_scope" CHECK (
 "id" <> 'chat-quytambao-tp54-20261120-22891463' OR (
  "fromFundId" = 'cmvx7um70000o07jvxskua7u0'
  AND "toFundId" = 'cmvwezpv4001he5r37x8jwezc'
  AND "accountId" IS NOT NULL AND "accountId" = 'cmvw2f3kh00000or3r3fgruqs'
  AND "requestId" = '96708641-a65f-4bbc-8f25-abdf3dd53998'
  AND "mode" = 'BALANCE_ONLY' AND "amount" = 22891463
  AND "actor" = 'system:chat-authorized:quytambao-tp54-20261120-22891463'
  AND "reversalOf" IS NULL
 )
);
ALTER TABLE "TransferBalanceItem"
 DROP CONSTRAINT "TransferBalanceItem_sourceAfter_check",
 ADD CONSTRAINT "TransferBalanceItem_sourceAfter_check" CHECK (
  "sourceAfter" >= 0 OR (
   "transferId" = 'chat-tp63-tp74-6afd6842-91c0-83ec-8234-26ff57e5bb0e'
   AND "accountId" = 'cmvw2f3kh00000or3r3fgruqs'
   AND "accountNumber" = '0572'
   AND "amount" = 25000000
   AND "sourceBefore" = -4747329 AND "sourceAfter" = -29747329
   AND "destinationBefore" = 0 AND "destinationAfter" = 25000000
  )
  OR (
   "transferId" = 'chat-quytambao-tp74-20261120-31774341'
   AND "accountId" = 'cmvw2f3kh00000or3r3fgruqs'
   AND "accountNumber" = '0572' AND "amount" = 31774341
   AND "sourceBefore" = 0 AND "sourceAfter" = -31774341
   AND "destinationBefore" = 0 AND "destinationAfter" = 31774341
  )
  OR (
   "transferId" = 'chat-quytambao-tp54-20261120-22891463'
   AND "accountId" = 'cmvw2f3kh00000or3r3fgruqs'
   AND "accountNumber" = '0572' AND "amount" = 22891463
   AND "sourceBefore" = -31774341 AND "sourceAfter" = -54665804
   AND "destinationBefore" = 55990142 AND "destinationAfter" = 78881605
  )
 );
