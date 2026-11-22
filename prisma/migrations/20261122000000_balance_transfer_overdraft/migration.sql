-- Balance-only transfers may overdraw a fund; receipt-allocation transfers remain guarded.
ALTER TABLE "TransferBalanceItem" DROP CONSTRAINT "TransferBalanceItem_sourceAfter_check";
CREATE FUNCTION guard_transfer_balance_overdraft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."sourceAfter" < 0 AND NOT EXISTS (
  SELECT 1 FROM "Transfer" WHERE id = NEW."transferId" AND mode = 'BALANCE_ONLY'
 ) THEN
  RAISE EXCEPTION 'Negative source balances require a balance-only transfer' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "TransferBalanceItem_overdraft_guard"
 BEFORE INSERT OR UPDATE ON "TransferBalanceItem"
 FOR EACH ROW EXECUTE FUNCTION guard_transfer_balance_overdraft();
