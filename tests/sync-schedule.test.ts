import assert from "node:assert/strict";
import { test } from "node:test";
import { dueSyncSlots, FULL_DAY_TIMES } from "../src/lib/sync-schedule";
test("ten daily slots use Vietnam midnight and do not depend on exact-minute cron delivery",()=>{
 assert.equal(FULL_DAY_TIMES.length,10);
 const midnight=dueSyncSlots(new Date("2026-11-01T00:01:40+07:00"));
 assert.equal(midnight.length,0,"October reconciliation is never scheduled after the Excel boundary");
 const late=dueSyncSlots(new Date("2026-11-01T10:37:00+07:00"));
 assert.equal(late.length,1);assert.equal(late.find(s=>s.kind==="FULL_DAY")?.slotKey,"FULL_DAY:2026-11-01:10:00");
 assert.equal(late.find(s=>s.kind==="PREVIOUS_DAY"),undefined);
 const next=dueSyncSlots(new Date("2026-11-02T00:01:40+07:00"));assert.equal(next[0].targetDate,"2026-11-01");assert.equal(next[0].kind,"PREVIOUS_DAY");
});
