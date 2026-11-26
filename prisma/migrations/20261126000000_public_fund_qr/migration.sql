ALTER TABLE "Fund" ADD COLUMN "publicQrAccount" TEXT;
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_publicQrAccount_check"
 CHECK ("publicQrAccount" IS NULL OR "publicQrAccount" IN ('0572', '0856'));
