import assert from "node:assert/strict";
import { test } from "node:test";
import { calculatePartGoal, readPartGoal, resolveFundGoal, fundedQuantity, remainingQuantity, fundGoalTypeSchema } from "../src/lib/fund-goal";
import { goalAchievementKey, goalEmailMilestone } from "../src/lib/fund-goal-policy";

test("parts goal is exact unit price times a positive whole-number target", () => {
  const goal = calculatePartGoal("180000", "100");
  assert.equal(goal.goalAmount, 18000000n);
  assert.deepEqual(goal.goalConfig, { version: 1, unit: "part", unitPrice: "180000", quantity: "100" });
  assert.equal(calculatePartGoal("999999999999999", "1").goalAmount, 999999999999999n);
  assert.throws(() => calculatePartGoal("999999999999999", "2"));
  for (const price of ["", "0", "-1", "180.000", "1e5", "1.5"]) assert.throws(() => calculatePartGoal(price, "100"));
  for (const quantity of ["", "0", "-1", "1.5", "1,5", "1e2", "1000000000"]) assert.throws(() => calculatePartGoal("180000", quantity));
});
test("part goals preserve their type, support partial monetary contributions and keep milestones", () => {
  const goal = resolveFundGoal({ goalType: "PARTS", goalUnitPrice: "180000", goalQuantity: "100", goalWidth: "3", goalAmount: 1n });
  assert.equal(goal.goalAmount, 18000000n);
  assert.deepEqual(resolveFundGoal({}, goal), goal);
  const config = readPartGoal(goal.goalType, goal.goalConfig)!;
  assert.equal(fundedQuantity(270000n, config, true), "1,5");
  assert.equal(remainingQuantity(270000n, config, true), "98,5");
  assert.equal(remainingQuantity(18000000n, config, true), "0,0");
  assert.equal(readPartGoal("LENGTH", goal.goalConfig), null);
  assert.equal(readPartGoal("PARTS", { version: 1, unit: "part", unitPrice: "0", quantity: "100" }), null);
  assert.deepEqual(resolveFundGoal({ goalType: "MONEY", goalAmount: 100n }, goal), { goalType: "MONEY", goalAmount: 100n, goalConfig: null });
  assert.equal(fundGoalTypeSchema.parse("PARTS"), "PARTS");
  assert.throws(() => fundGoalTypeSchema.parse("UNKNOWN"));
  assert.equal(goalEmailMilestone({ status: "ACTIVE", goalAmount: goal.goalAmount, income: 14400000n }), 80);
  assert.ok(goalAchievementKey({ id: "p", status: "ACTIVE", goalAmount: goal.goalAmount, income: 18000000n }));
});
