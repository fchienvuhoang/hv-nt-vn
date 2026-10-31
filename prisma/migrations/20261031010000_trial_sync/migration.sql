-- Optional trial start; existing accounts and balances remain unchanged.
ALTER TABLE "BankAccount" ADD COLUMN "trialStartedAt" TIMESTAMP(3);
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_trial_requires_cutover"
CHECK ("trialStartedAt" IS NULL OR ("cutoverAt" IS NOT NULL AND "finalizedAt" IS NULL));
