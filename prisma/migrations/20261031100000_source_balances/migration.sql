ALTER TABLE "BankAccount"
  ADD COLUMN "sourceTotalCredit" BIGINT,
  ADD COLUMN "sourceTotalDebit" BIGINT,
  ADD COLUMN "sourceFetchedAt" TIMESTAMP(3),
  ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "sourceAttemptAt" TIMESTAMP(3),
  ADD COLUMN "sourceError" TEXT NOT NULL DEFAULT '';
