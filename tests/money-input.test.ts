import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoneyInput, moneyInputDigits, pastedMoneyDigits, moneyCaretPosition } from "../src/lib/money-input";

test("VND input formats thousands while preserving the exact raw integer", () => {
  for (const [raw, formatted] of [["", ""], ["0", "0"], ["1000", "1.000"], ["10000000", "10.000.000"], ["999999999999999", "999.999.999.999.999"]]) {
    assert.equal(formatMoneyInput(raw), formatted);
    assert.equal(moneyInputDigits(formatted), raw);
  }
  assert.equal(formatMoneyInput("9007199254740993"), "9.007.199.254.740.993", "formatter never rounds through Number");
  assert.equal(moneyInputDigits("1000000000000000"), null, "reject rather than truncate values beyond business limit");
  assert.equal(moneyInputDigits("0000123"), "123");
});

test("pasted money accepts grouping/currency and rejects signs, fractions and scientific notation", () => {
  for (const value of ["10000000", "10.000.000", "10,000,000", "10 000 000", "10.000.000 ₫", "10.000.000 VND", "10\u00a0000\u00a0000 đ"]) assert.equal(pastedMoneyDigits(value), "10000000", value);
  for (const value of ["-1000", "+1000", "1e6", "1.5", "1,50", "12.34.567", "abc100", "1000000000000000"]) assert.equal(pastedMoneyDigits(value), null, value);
});

test("caret follows digit position across grouping separators and deletions", () => {
  assert.equal(moneyCaretPosition("10.000.000", 0), 0);
  assert.equal(moneyCaretPosition("10.000.000", 2), 2);
  assert.equal(moneyCaretPosition("10.000.000", 3), 4);
  assert.equal(moneyCaretPosition("1.234", 4), 5);
  assert.equal(moneyCaretPosition("", 1), 0);
});
