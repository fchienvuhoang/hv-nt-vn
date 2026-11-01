ALTER TABLE "Fund" ADD COLUMN "goalAmount" BIGINT;
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_goalAmount_positive" CHECK ("goalAmount" IS NULL OR "goalAmount" > 0);
