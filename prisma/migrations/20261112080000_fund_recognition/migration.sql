ALTER TABLE "Fund" ADD COLUMN "recognitionEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "recognitionTitle" TEXT NOT NULL DEFAULT 'Cổ phần',
 ADD COLUMN "recognitionAmount" BIGINT;
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_recognition_config_check" CHECK (
 ("recognitionAmount" IS NULL OR "recognitionAmount" > 0) AND
 (NOT "recognitionEnabled" OR ("recognitionAmount" IS NOT NULL AND length(trim("recognitionTitle")) > 0))
);
CREATE TABLE "FundRecognitionName" (
 "fundId" TEXT NOT NULL REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "transactionId" TEXT NOT NULL REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "name" TEXT NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 PRIMARY KEY ("fundId", "transactionId")
);
CREATE INDEX "FundRecognitionName_transactionId_idx" ON "FundRecognitionName"("transactionId");
