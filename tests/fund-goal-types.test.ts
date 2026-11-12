import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateLengthGoal, resolveFundGoal, readLengthGoal, formatMeasure, fundedLength, goalArea } from "../src/lib/fund-goal";
import { goalAchievementKey, goalEmailMilestone } from "../src/lib/fund-goal-policy";

test("length goals multiply length by per-metre price; width is descriptive only", () => {
  const goal = calculateLengthGoal("1500000", "3", "350");
  assert.equal(goal.goalAmount, 525000000n);
  assert.deepEqual(goal.goalConfig, { version: 2, unit: "m", unitPrice: "1500000", width: "3", quantity: "350" });
  assert.equal(goalArea(goal.goalConfig), "1.050");
  assert.equal(calculateLengthGoal("1500000", "3", "12,5").goalAmount, 18750000n);
  assert.equal(calculateLengthGoal("1500000", "3", "12.5000").goalConfig.quantity, "12.5");
  assert.equal(calculateLengthGoal("1", "0.0001", "0.0001").goalAmount, 1n);
  assert.equal(calculateLengthGoal("999999999999999", "1", "1").goalAmount, 999999999999999n);
  assert.throws(() => calculateLengthGoal("999999999999999", "1", "1.0001"));
  for (const price of ["", "0", "-1", "1.5", "1e6", "1000000000000000"]) assert.throws(() => calculateLengthGoal(price, "3", "350"));
  for (const value of ["", "0", "0,0000", "-1", "1e3", "1.00001", "1,2.3", "1000000000"]) {
    assert.throws(() => calculateLengthGoal("1500000", "3", value));
    assert.throws(() => calculateLengthGoal("1500000", value, "350"));
  }
});
test("a fund has only one active goal; old forms preserve or deliberately replace it", () => {
  const money = resolveFundGoal({ goalAmount: 100000000n });
  assert.deepEqual(money, { goalType: "MONEY", goalAmount: 100000000n, goalConfig: null });
  const length = resolveFundGoal({ goalType: "LENGTH", goalAmount: 1n, goalUnitPrice: "1500000", goalWidth: "3", goalQuantity: "350" }, money);
  assert.equal(length.goalAmount, 525000000n, "server ignores forged calculated money");
  assert.deepEqual(resolveFundGoal({}, length), length, "omitting goal fields preserves the saved type and inputs");
  assert.deepEqual(resolveFundGoal({ goalType: "MONEY", goalAmount: null }, length), { goalType: "MONEY", goalAmount: null, goalConfig: null });
  assert.throws(() => resolveFundGoal({ goalType: "LENGTH", goalUnitPrice: "1500000", goalQuantity: "350" }, money));
});
test("funded length ignores the width and remains a monetary equivalent, not construction progress", () => {
  const goal = calculateLengthGoal("1500000", "3", "350");
  assert.deepEqual(readLengthGoal("LENGTH", goal.goalConfig), goal.goalConfig);
  assert.equal(readLengthGoal("MONEY", goal.goalConfig), null);
  assert.equal(readLengthGoal("LENGTH", { version: 2, unit: "m", width: "3", quantity: "bad", unitPrice: "0" }), null);
  assert.equal(formatMeasure("1234.5000"), "1.234,5");
  assert.equal(fundedLength(18750000n, goal.goalConfig), "12,5");
  assert.equal(fundedLength(-1n, goal.goalConfig), "0");
  assert.equal(goalEmailMilestone({ status: "ACTIVE", goalAmount: goal.goalAmount, income: 420000000n }), 80);
  assert.ok(goalAchievementKey({ id: "f", status: "ACTIVE", goalAmount: goal.goalAmount, income: 525000000n }));
});

test("remaining metres round conservatively and never show zero before the target is funded", async () => {
  const { remainingLength } = await import("../src/lib/fund-goal");
  const goal = calculateLengthGoal("1500000", "3", "350");
  assert.equal(remainingLength(0n, goal.goalConfig), "350");
  assert.equal(remainingLength(18750000n, goal.goalConfig), "337,5");
  assert.equal(remainingLength(goal.goalAmount - 1n, goal.goalConfig), "0,0001");
  assert.equal(remainingLength(goal.goalAmount, goal.goalConfig), "0");
  assert.equal(remainingLength(goal.goalAmount + 1n, goal.goalConfig), "0");
});

test("compact public metre values show one decimal and preserve nonzero small remainders", async () => {
  const { remainingLength } = await import("../src/lib/fund-goal");
  const goal = calculateLengthGoal("10000", "1", "350");
  assert.equal(fundedLength(78914n, goal.goalConfig, true), "7,9");
  assert.equal(fundedLength(70000n, goal.goalConfig, true), "7,0");
  assert.equal(remainingLength(goal.goalAmount - 1n, goal.goalConfig, true), "<0,1");
});

test("430,000 VND per metre for 350 metres costs 150,500,000 VND regardless of width", () => {
  const a = calculateLengthGoal("430000", "3", "350");
  const b = calculateLengthGoal("430000", "8", "350");
  assert.equal(a.goalAmount, 150500000n);
  assert.equal(b.goalAmount, a.goalAmount);
  assert.equal(fundedLength(3010000n, a.goalConfig, true), "7,0");
  assert.equal(fundedLength(3010000n, b.goalConfig, true), "7,0");
});
