import { test } from "node:test";
import assert from "node:assert/strict";
import { goalAchievementKey, adminNotificationEmails, goalEmailMilestone, morningReportDate } from "../src/lib/fund-goal-policy";
import { defaultPushPreferences, pushDestination } from "../src/lib/push-policy";

test("only active funds with a reached positive goal produce a milestone", () => {
  const fund = { id: "fund", status: "ACTIVE", goalAmount: 154000000n, income: 153999999n };
  assert.equal(goalAchievementKey(fund), null);
  for (const income of [154000000n, 200000000n]) assert.equal(goalAchievementKey({ ...fund, income }), "fund-goal:fund:154000000");
  for (const goalAmount of [null, 0n, -1n]) assert.equal(goalAchievementKey({ ...fund, goalAmount }), null);
  for (const status of ["PAUSED", "COMPLETED"]) assert.equal(goalAchievementKey({ ...fund, status, income: 200000000n }), null);
});

test("progress emails use inclusive milestones, coalesce jumps and never repeat lower milestones", () => {
  const fund = { status: "ACTIVE", goalAmount: 1000n, income: 799n };
  assert.equal(goalEmailMilestone(fund), null);
  for (const [income, expected] of [[800n, 80], [900n, 90], [950n, 95], [1000n, 100], [1100n, 100]] as const) assert.equal(goalEmailMilestone({ ...fund, income }), expected);
  assert.equal(goalEmailMilestone({ ...fund, income: 960n }, 80), 95);
  assert.equal(goalEmailMilestone({ ...fund, income: 900n }, 95), null);
  assert.equal(goalEmailMilestone({ ...fund, income: 1000n }, 100), null);
  assert.equal(goalEmailMilestone({ ...fund, status: "PAUSED", income: 1000n }), null);
});

test("morning reports start at 07:00 Vietnam, catch up same day and skip the activation day's past slot", () => {
  const activated = new Date("2026-11-02T10:00:00Z");
  assert.equal(morningReportDate(new Date("2026-11-02T11:00:00Z"), activated), null);
  assert.equal(morningReportDate(new Date("2026-11-02T23:59:59Z"), activated), null);
  assert.equal(morningReportDate(new Date("2026-11-03T00:00:00Z"), activated), "2026-11-03");
  assert.equal(morningReportDate(new Date("2026-11-03T01:00:00Z"), activated), "2026-11-03");
});

test("milestones keep exact VND and stay stable across income corrections", () => {
  const fund = { id: "fund", status: "ACTIVE", goalAmount: 9007199254740993n, income: 9007199254740994n };
  assert.equal(goalAchievementKey(fund), "fund-goal:fund:9007199254740993");
  assert.equal(goalAchievementKey(fund), goalAchievementKey({ ...fund, income: fund.income + 1n }));
  assert.notEqual(goalAchievementKey(fund), goalAchievementKey({ ...fund, goalAmount: fund.goalAmount + 1n }));
});

test("achievement recipients reuse unique authorized login emails and push opens funds", () => {
  assert.deepEqual(adminNotificationEmails(" Admin@Example.com, ,admin@example.com, Other@example.com "), ["admin@example.com", "other@example.com"]);
  assert.deepEqual(adminNotificationEmails(""), []);
  assert.equal(defaultPushPreferences.fundGoalReached, true);
  assert.equal(pushDestination("fundGoalReached"), "/admin?view=funds");
});
