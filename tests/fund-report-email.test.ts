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

test("report lists yesterday by fund and preserves expense narratives and assignment destinations", () => {
  const content = fundReportEmail({
    funds: [{ code: "TP1", name: "Thiện pháp A", status: "ACTIVE", income: 500000n, expense: 100000n, balance: 400000n, goalAmount: null }],
    generatedAt: new Date("2026-11-02T01:00:00Z"), syncAt: null, yesterday: "01/11/2026", yesterdayIncome: 500000n, yesterdayExpense: 100000n, yesterdayIncomeCount: 8, yesterdayExpenseCount: 1,
    yesterdayFunds: [{ code: "TP1", name: "Thiện pháp A", income: 500000n, expense: 100000n, incomeCount: 8, expenseCount: 1 }],
    expenses: [{ at: new Date("2026-11-01T02:30:00Z"), account: "0572", amount: 100000n, narrative: "TP1 mua <vật tư>", assignment: "AUTO", reason: "Khớp mã TP1", funds: [{ code: "TP1", amount: 100000n }] }],
  });
  assert.match(content.TextPart, /Cú pháp chi \/ Nội dung gốc/);
  assert.match(content.TextPart, /TP1 mua <vật tư>/);
  assert.match(content.TextPart, /Gán tự động/);
  assert.match(content.TextPart, /Khớp mã TP1/);
  assert.match(content.TextPart, /09:30/);
  assert.match(content.TextPart, /500\.000.* · 8 GD/);
  assert.match(content.HTMLPart, /Thu · 8 GD/);
  assert.match(content.HTMLPart, /class="cell-value"/);
  assert.match(content.HTMLPart, /&lt;vật tư&gt;/);
  assert.match(content.HTMLPart, /max-width:1000px/);
  assert.ok(content.TextPart.indexOf("Khoản chi hôm qua") < content.TextPart.indexOf("Danh sách toàn bộ"));
});
