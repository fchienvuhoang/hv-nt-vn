-- User approved a single 25m TP63 -> TP74 balance-only transfer despite a deficit.
-- A fixed transfer primary key and exact snapshot keep every other transfer guarded.
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_tp63_tp74_exception_scope" CHECK (
 "id" <> 'chat-tp63-tp74-6afd6842-91c0-83ec-8234-26ff57e5bb0e' OR (
  "fromFundId" = 'cmvwchbas0004e5r35dqbbvik'
  AND "toFundId" = 'cmwlvkcf5000008l9crhuiyyo'
  AND "accountId" IS NOT NULL AND "accountId" = 'cmvw2f3kh00000or3r3fgruqs'
  AND "requestId" = '6afd6842-91c0-43ec-8234-26ff57e5bb0e'
  AND "mode" = 'BALANCE_ONLY' AND "amount" = 25000000
  AND "actor" = 'system:chat-authorized:6afd6842-91c0-83ec-8234-26ff57e5bb0e'
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
 );
