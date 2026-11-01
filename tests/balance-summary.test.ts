import test from 'node:test';import assert from 'node:assert/strict';import {splitBalance,summarizeBalances} from '../src/lib/balance-summary';
test('available balances and positive shortfalls preserve the signed total',()=>{
 assert.deepEqual(splitBalance(-20n),{availableBalance:0n,excessExpense:20n});assert.deepEqual(splitBalance(0n),{availableBalance:0n,excessExpense:0n});assert.deepEqual(splitBalance(50n),{availableBalance:50n,excessExpense:0n});
 const total=summarizeBalances([{balance:-20n},{balance:50n}]);assert.deepEqual(total,{availableBalance:50n,excessExpense:20n,balance:30n});assert.equal(total.balance,total.availableBalance-total.excessExpense);
 assert.deepEqual(summarizeBalances([]),{availableBalance:0n,excessExpense:0n,balance:0n});const huge=summarizeBalances([{balance:90071992547409930n},{balance:-19n}]);assert.equal(huge.balance,90071992547409911n);
});
