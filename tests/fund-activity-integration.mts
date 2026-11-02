import assert from "node:assert/strict";
const url = new URL(process.env.DATABASE_URL ?? "https://invalid");
if (url.hostname !== "localhost" || !url.pathname.startsWith("/hvntvn_test")) throw new Error("Isolated test DB required");
const { db } = await import("../src/lib/db");
const { fundActivity } = await import("../src/lib/fund-activity");
const { transactionWhere } = await import("../src/lib/transaction-navigation-data");
if (await db.bankAccount.count()) throw new Error("Empty test DB required");
try {
  const a = await db.bankAccount.create({ data: { number: "ACTIVITY-A", owner: "TEST", label: "TEST" } });
  const b = await db.bankAccount.create({ data: { number: "ACTIVITY-B", owner: "TEST", label: "TEST" } });
  const f = await db.fund.create({ data: { accountId: a.id, code: "TPACT1", name: "First", slug: "activity-first", keywords: [] } });
  const g = await db.fund.create({ data: { accountId: b.id, code: "TPACT2", name: "Second", slug: "activity-second", keywords: [] } });
  let sequence = 0;
  async function make(amount: bigint, direction: "CREDIT" | "DEBIT", fundId: string | null, assignment: "AUTO" | "MANUAL" | "UNASSIGNED", extra = {}) {
    return db.bankTransaction.create({ data: { accountId: a.id, sourceId: `ACT-${sequence++}`, refId: "TEST", source: {}, sourceHash: "TEST", narrative: "ACTIVITY", displayName: "TEST", amount, direction, fundId, assignment, occurredAt: new Date("2026-11-02T02:00:00Z"), ...extra } });
  }
  await make(100n, "DEBIT", f.id, "AUTO");
  await make(200n, "DEBIT", g.id, "MANUAL");
  await make(300n, "DEBIT", null, "UNASSIGNED", { accountId: b.id });
  const split = await make(1000n, "CREDIT", f.id, "MANUAL");
  await db.fundAllocation.createMany({ data: [{ transactionId: split.id, fundId: f.id, accountId: a.id, amount: 600n }, { transactionId: split.id, fundId: g.id, accountId: a.id, amount: 400n }] });
  await make(50n, "CREDIT", f.id, "AUTO");
  await make(900n, "DEBIT", f.id, "AUTO", { occurredAt: new Date("2026-11-01T16:59:59Z") });
  await make(999n, "DEBIT", f.id, "AUTO", { entryStatus: "REVIEW" });
  await make(111n, "DEBIT", f.id, "MANUAL", { entryStatus: "MERGED" });
  const unknown = await make(333n, "DEBIT", f.id, "MANUAL");
  await db.transactionNote.create({ data: { transactionId: unknown.id, requestId: "activity-undated", kind: "SOURCE_DATE_MISSING", text: "No source date", actor: "TEST" } });
  const filter = { date: "2026-11-02", allTime: false, fundId: "", account: "" };
  const report = await fundActivity(filter);
  assert.deepEqual(report.total.expense, { count: 3, amount: 600n });
  assert.deepEqual(report.total.auto, { count: 1, amount: 100n });
  assert.deepEqual(report.total.manual, { count: 1, amount: 200n });
  assert.deepEqual(report.total.unassigned, { count: 1, amount: 300n });
  assert.deepEqual(report.total.income, { count: 2, amount: 1050n }, "split receipts counted once globally");
  assert.equal(report.funds.find(row => row.id === f.id)!.income.amount, 650n);
  assert.equal(report.funds.find(row => row.id === g.id)!.income.amount, 400n);
  assert.equal(report.funds.reduce((sum, row) => sum + row.income.amount, 0n), report.total.income.amount);
  const own = await fundActivity({ ...filter, fundId: f.id });
  assert.equal(own.total.income.amount, 650n);
  assert.equal(own.total.expense.amount, 100n);
  assert.equal(own.total.unassigned.count, 0);
  const account = await fundActivity({ ...filter, account: b.id });
  assert.equal(account.total.expense.amount, 300n);
  assert.equal(account.total.income.amount, 0n);
  assert.equal((await fundActivity({ ...filter, allTime: true })).total.expense.amount, 1833n);
  const base = { from: filter.date, to: filter.date, q: "", type: "DEBIT", review: "", account: "", posted: "1" };
  for (const assignment of ["AUTO", "MANUAL"]) {
    const rows = await db.bankTransaction.findMany({ where: transactionWhere({ ...base, assignment }) });
    assert.equal(rows.length, 1, "drilldown matches assignment aggregate and excludes review/merged/undated");
  }
  console.log("PASS: expense categories, split receipts, exact totals, daily Vietnam boundary, all-time, fund/account scopes and transaction drilldowns");
} finally {
  await db.transactionNote.deleteMany();
  await db.fundAllocation.deleteMany();
  await db.bankTransaction.deleteMany();
  await db.fund.deleteMany();
  await db.bankAccount.deleteMany();
  await db.$disconnect();
}
