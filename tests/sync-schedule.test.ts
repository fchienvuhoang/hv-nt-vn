import assert from "node:assert/strict";
import { test } from "node:test";
import { dueSyncSlots, FULL_DAY_TIMES } from "../src/lib/sync-schedule";
test("ten daily slots use Vietnam midnight and do not depend on exact-minute cron delivery",()=>{
 assert.equal(FULL_DAY_TIMES.length,10);
 const midnight=dueSyncSlots(new Date("2026-11-01T00:01:40+07:00"));
 assert.equal(midnight.length,1);assert.equal(midnight[0].targetDate,"2026-10-31");assert.equal(midnight[0].kind,"PREVIOUS_DAY");
 const late=dueSyncSlots(new Date("2026-11-01T10:37:00+07:00"));
 assert.equal(late.length,2);assert.equal(late.find(s=>s.kind==="FULL_DAY")?.slotKey,"FULL_DAY:2026-11-01:10:00");
 assert.equal(late.find(s=>s.kind==="PREVIOUS_DAY")?.slotKey,"PREVIOUS_DAY:2026-11-01:06:01");
});
