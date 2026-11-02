import { test } from "node:test";
import assert from "node:assert/strict";
import { fundReportEmail } from "../src/lib/fund-report-email";

test("report keeps deficits separate, includes funds without goals and identifies real data timing", () => {
  const content = fundReportEmail({
    funds: [
      { code: "TP1", name: "Thiện pháp A", status: "ACTIVE", income: 900000n, expense: 100000n, balance: 800000n, goalAmount: 1000000n },
      { code: "TP2", name: "Thiện pháp B", status: "PAUSED", income: 100000n, expense: 300000n, balance: -200000n, goalAmount: null },
    ], generatedAt: new Date("2026-11-02T01:00:00Z"), syncAt: null, yesterday: "01/11/2026", yesterdayIncome: 50000n, yesterdayExpense: 10000n,
  });
  for (const value of ["TP1", "TP2", "90%", "800.000", "200.000", "50.000", "10.000", "01/11/2026"]) assert.ok(content.TextPart.includes(value), value);
  assert.match(content.TextPart, /1 thiện pháp từ 80% đến dưới 100%/);
  assert.match(content.TextPart, /Chưa xác nhận được thời điểm đồng bộ/);
  assert.match(content.TextPart, /không bao gồm tiền chưa phân loại/);
  assert.ok(!content.HTMLPart.includes("/admin?view=funds"));
});
