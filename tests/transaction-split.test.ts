import assert from "node:assert/strict";
import { test } from "node:test";
import { transactionSplitSchema, validateSplitTotal, originalFundShare } from "../src/lib/transaction-split-input";
const input = { requestId: "11111111-1111-4111-8111-111111111111", transactionId: "row", updatedAt: new Date().toISOString(), reason: "Chia theo thí chủ", shares: [{ fundId: "a", amount: "600000" }, { fundId: "b", amount: "400000" }] };
test("split validates exact integer money, distinct funds, reason and version", () => {
  assert.deepEqual(transactionSplitSchema.parse(input), input);
  validateSplitTotal(input.shares, 1000000n);
  for (const amount of ["0", "-1", "1.5", "1e6", "1000000000000000"]) assert.throws(() => transactionSplitSchema.parse({ ...input, shares: [{ fundId: "a", amount }, input.shares[1]] }));
  assert.throws(() => transactionSplitSchema.parse({ ...input, shares: [input.shares[0], input.shares[0]] }));
  assert.throws(() => transactionSplitSchema.parse({ ...input, shares: [input.shares[0]] }));
  assert.throws(() => validateSplitTotal(input.shares, 999999n));
  assert.throws(() => validateSplitTotal(input.shares, 1000001n));
});
test("original receipt share remains independent of current allocations", () => {
  const row = { amount: 1000000n, originalAllocations: input.shares };
  assert.equal(originalFundShare(row, "a"), 600000n);
  assert.equal(originalFundShare(row, "b"), 400000n);
  assert.equal(originalFundShare(row, "other"), 0n);
  assert.equal(originalFundShare({ amount: 1000000n }, "a"), 1000000n);
});
