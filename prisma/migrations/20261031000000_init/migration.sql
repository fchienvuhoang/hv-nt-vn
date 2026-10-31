-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FundStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "Assignment" AS ENUM ('UNASSIGNED', 'AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cutoverAt" TIMESTAMP(3),
    "openingBankBalance" BIGINT NOT NULL DEFAULT 0,
    "openingUnallocated" BIGINT NOT NULL DEFAULT 0,
    "openingDifference" BIGINT NOT NULL DEFAULT 0,
    "differenceReason" TEXT NOT NULL DEFAULT '',
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT[],
    "status" "FundStatus" NOT NULL DEFAULT 'ACTIVE',
    "openingIncome" BIGINT NOT NULL DEFAULT 0,
    "openingExpense" BIGINT NOT NULL DEFAULT 0,
    "openingTransferNet" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "direction" "Direction" NOT NULL,
    "narrative" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "hiddenNarrative" BOOLEAN NOT NULL DEFAULT false,
    "hiddenNote" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "source" JSONB NOT NULL,
    "fundId" TEXT,
    "assignment" "Assignment" NOT NULL DEFAULT 'UNASSIGNED',
    "matchReason" TEXT NOT NULL DEFAULT '',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromFundId" TEXT NOT NULL,
    "toFundId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "reversalOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "completedTo" TIMESTAMP(3),
    "windowFrom" TEXT,
    "windowTo" TEXT,
    "nextPage" INTEGER NOT NULL DEFAULT 1,
    "lastSuccessAt" TIMESTAMP(3),

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLease" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_number_key" ON "BankAccount"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Fund_slug_key" ON "Fund"("slug");

-- CreateIndex
CREATE INDEX "Fund_accountId_status_idx" ON "Fund"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Fund_accountId_code_key" ON "Fund"("accountId", "code");

-- CreateIndex
CREATE INDEX "BankTransaction_accountId_occurredAt_idx" ON "BankTransaction"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "BankTransaction_fundId_direction_occurredAt_idx" ON "BankTransaction"("fundId", "direction", "occurredAt");

-- CreateIndex
CREATE INDEX "BankTransaction_assignment_occurredAt_idx" ON "BankTransaction"("assignment", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_accountId_sourceId_key" ON "BankTransaction"("accountId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_requestId_key" ON "Transfer"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_reversalOf_key" ON "Transfer"("reversalOf");

-- CreateIndex
CREATE INDEX "Transfer_fromFundId_createdAt_idx" ON "Transfer"("fromFundId", "createdAt");

-- CreateIndex
CREATE INDEX "Transfer_toFundId_createdAt_idx" ON "Transfer"("toFundId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_accountId_direction_key" ON "SyncState"("accountId", "direction");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromFundId_fkey" FOREIGN KEY ("fromFundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toFundId_fkey" FOREIGN KEY ("toFundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_reversalOf_fkey" FOREIGN KEY ("reversalOf") REFERENCES "Transfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncState" ADD CONSTRAINT "SyncState_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Accounting invariants apply even to writes outside the application.
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_nonnegative_amount" CHECK (amount >= 0);
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_positive_amount" CHECK (amount > 0);
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_distinct_funds" CHECK ("fromFundId" <> "toFundId");
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_nonnegative_opening_income" CHECK ("openingIncome" >= 0);
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_nonnegative_opening_expense" CHECK ("openingExpense" >= 0);
