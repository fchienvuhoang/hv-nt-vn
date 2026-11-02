CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "BankTransaction_narrative_trgm_idx" ON "BankTransaction" USING GIN ("narrative" gin_trgm_ops);
CREATE INDEX "BankTransaction_refId_trgm_idx" ON "BankTransaction" USING GIN ("refId" gin_trgm_ops);
