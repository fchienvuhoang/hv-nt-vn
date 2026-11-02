import { test } from "node:test";
import assert from "node:assert/strict";
import { goalAchievementKey, adminNotificationEmails } from "../src/lib/fund-goal-policy";
import { defaultPushPreferences, pushDestination } from "../src/lib/push-policy";

test("only active funds with a reached positive goal produce a milestone", () => {
  const fund = { id: "fund", status: "ACTIVE", goalAmount: 154000000n, income: 153999999n };
  assert.equal(goalAchievementKey(fund), null);
  for (const income of [154000000n, 200000000n]) assert.equal(goalAchievementKey({ ...fund, income }), "fund-goal:fund:154000000");
  for (const goalAmount of [null, 0n, -1n]) assert.equal(goalAchievementKey({ ...fund, goalAmount }), null);
  for (const status of ["PAUSED", "COMPLETED"]) assert.equal(goalAchievementKey({ ...fund, status, income: 200000000n }), null);
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
