import assert from "node:assert/strict";
import test from "node:test";
import {transferBalanceError} from "../src/lib/transfer-balance";

test("transfer requires positive net balance and preserves zero as a valid remainder",()=>{
  const balances=[{accountId:"a",balance:"100"},{accountId:"b",balance:"-80"}];
  assert.equal(transferBalanceError(balances,20n),null);
  assert.match(transferBalanceError(balances,21n)!,/Không đủ/);
  assert.match(transferBalanceError(balances,1n,"b")!,/phạm vi/);
  for(const balance of ["0","-1"])assert.match(transferBalanceError([{accountId:"a",balance}],1n)!,/số dư dương/);
  assert.match(transferBalanceError(balances,0n)!,/lớn hơn 0/);
  assert.match(transferBalanceError(balances,-1n)!,/lớn hơn 0/);
});

test("selected account limits transfer even when fund total is sufficient",()=>{
  const balances=[{accountId:"a",balance:10n},{accountId:"b",balance:90n}];
  assert.equal(transferBalanceError(balances,10n,"a"),null);
  assert.match(transferBalanceError(balances,11n,"a")!,/Không đủ/);
  assert.equal(transferBalanceError(balances,100n),null);
  assert.match(transferBalanceError(balances,1n,"missing")!,/phạm vi/);
  assert.equal(transferBalanceError(balances,null),null);
});
