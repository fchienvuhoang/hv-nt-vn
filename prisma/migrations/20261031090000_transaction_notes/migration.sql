CREATE TABLE "TransactionNote" (
 "id" TEXT NOT NULL,
 "requestId" TEXT NOT NULL,
 "transactionId" TEXT NOT NULL,
 "text" TEXT NOT NULL,
 "kind" TEXT NOT NULL DEFAULT 'NOTE',
 "actor" TEXT NOT NULL,
 "actorId" TEXT,
 "actorName" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TransactionNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TransactionNote_requestId_key" ON "TransactionNote"("requestId");
CREATE INDEX "TransactionNote_transactionId_createdAt_idx" ON "TransactionNote"("transactionId", "createdAt");
CREATE INDEX "AuditLog_action_entityId_idx" ON "AuditLog"("action", "entityId");
ALTER TABLE "TransactionNote" ADD CONSTRAINT "TransactionNote_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
