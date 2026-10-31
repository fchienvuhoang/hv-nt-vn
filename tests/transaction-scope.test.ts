import {test} from "node:test";
import assert from "node:assert/strict";
import {transactionDates} from "../src/lib/transaction-scope";
test("no dates means all history, one date means a single Vietnam day, invalid ranges remain restricted",()=>{
 const all=transactionDates();assert.equal(all.allTime,true);assert.equal(all.from,"");assert.equal(all.to,"");assert.equal(all.start.toISOString(),"0001-01-01T00:00:00.000Z");
 const day=transactionDates("2026-11-01");assert.equal(day.allTime,false);assert.equal(day.to,"2026-11-01");assert.equal(day.start.toISOString(),"2026-10-31T17:00:00.000Z");assert.equal(day.end.getTime()-day.start.getTime(),86400000);
 assert.equal(transactionDates(undefined,"2026-11-01").from,"2026-11-01");assert.ok(transactionDates("2026-02-30","2026-03-01").error);assert.equal(transactionDates("invalid").allTime,false);
});
