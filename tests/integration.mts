import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
// Run only against an explicitly isolated test database; never load .env here.
const testUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!["localhost", "127.0.0.1"].includes(testUrl.hostname) || !testUrl.pathname.startsWith("/hvntvn_test")) throw new Error("Require isolated localhost hvntvn_test database");
const { db } = await import("../src/lib/db");
const { synchronize, SyncBusy } = await import("../src/lib/sync");
const { transferFunds, reverseFundTransfer } = await import("../src/lib/transfers");
const { fundTotals, accountTotals } = await import("../src/lib/ledger");
const { startOfVietnamDay, localDate } = await import("../src/lib/domain");
const originalFetch = globalThis.fetch;
async function clean() {
  await db.auditLog.deleteMany(); await db.syncLease.deleteMany(); await db.syncRun.deleteMany();
  await db.transfer.deleteMany({ where: { reversalOf: { not: null } } }); await db.transfer.deleteMany();
  await db.bankTransaction.deleteMany(); await db.syncState.deleteMany(); await db.fundImport.deleteMany(); await db.fund.deleteMany(); await db.bankAccount.deleteMany();
}
try {
  await clean();
  const today = localDate();
  const account = await db.bankAccount.create({ data: { number: "0572", owner: "TEST", label: "TEST", cutoverAt: startOfVietnamDay(today), openingBankBalance: 1000000n, finalizedAt: new Date() } });
  const other = await db.bankAccount.create({ data: { number: "0856", owner: "TEST", label: "TEST", cutoverAt: startOfVietnamDay(today), finalizedAt: new Date() } });
  const fund = await db.fund.create({ data: { accountId: account.id, code: "TP112", name: "TEST", slug: "test-112", keywords: [], openingIncome: 1000000n } });
  const paused = await db.fund.create({ data: { accountId: account.id, code: "TP113", name: "TEST PAUSED", slug: "test-113", keywords: [], status: "PAUSED" } });
  const another = await db.fund.create({ data: { accountId: other.id, code: "TP122", name: "TEST OTHER", slug: "test-122", keywords: [] } });
  let failSecondPage = false;
  let modified = false;
  const item = (i: number) => ({ id: `21164105478711${String(i).padStart(5,"0")}`, bankAccountId: "2028140453689352192", refId: `TEST-${i}`, transactionAmount: modified && i === 0 ? 3000 : 1000, type: "CREDIT", narrative: i === 1 ? "TP113" : "TP112 0912345678", displayName: "TEST", transactionTime: `${today}T10:00:00` });
  globalThis.fetch = async input => {
    const url = new URL(String(input)), page = Number(url.searchParams.get("page"));
    if (url.searchParams.get("accountNo") !== "0572") return Response.json({ status: 200, data: { total: 0, page, items: [] } });
    if (url.searchParams.get("type") === "DEBIT") return Response.json({ status: 200, data: { total: 1, page, items: [{ ...item(999), type: "DEBIT", transactionAmount: 250 }] } });
    if (page === 2 && failSecondPage) throw new Error("simulated upstream outage");
    // Simulate API's extra look-ahead row and overlapping page boundary.
    return Response.json({ status: 200, data: { total: 102, page, items: page === 1 ? Array.from({length: 101}, (_,i) => item(i)) : [item(100), item(101)] } });
  };
  process.env.SYNC_MAX_PAGES = "4";
  const first = await synchronize("test");
  assert.equal(first.inserted, 102); assert.equal(first.pending, true);
  assert.equal(await db.bankTransaction.count(), 102);
  const cursor = await db.syncState.findUniqueOrThrow({ where: { accountId_direction: { accountId: account.id, direction: "CREDIT" } } });
  assert.equal(cursor.nextPage, 2); assert.equal(cursor.lastSuccessAt, null);
  failSecondPage = true;
  await assert.rejects(synchronize("test"), /simulated/);
  assert.equal((await db.syncState.findUniqueOrThrow({ where: { id: cursor.id } })).nextPage, 2);
  assert.equal(await db.syncLease.count(), 0);
  failSecondPage = false;
  const second = await synchronize("test"); assert.equal(second.inserted, 1);
  assert.equal(await db.bankTransaction.count(), 103);
  assert.ok((await db.syncState.findUniqueOrThrow({ where: { id: cursor.id } })).lastSuccessAt);
  process.env.SYNC_MAX_PAGES = "8";
  const repeated = await synchronize("test"); assert.equal(repeated.inserted, 0);
  assert.equal(await db.bankTransaction.count({ where: { fundId: null } }), 1);
  const manual = await db.bankTransaction.findFirstOrThrow({ where: { refId: "TEST-0" } });
  await db.bankTransaction.update({ where: { id: manual.id }, data: { fundId: paused.id, assignment: "MANUAL", matchReason: "manual test" } });
  modified = true;
  const changed = await synchronize("test"); assert.equal(changed.updated, 1);
  const retained = await db.bankTransaction.findUniqueOrThrow({ where: { id: manual.id } });
  assert.equal(retained.fundId, paused.id); assert.equal(retained.assignment, "MANUAL"); assert.equal(retained.amount, 3000n);
  assert.equal(await db.auditLog.count({ where: { action: "SOURCE_UPDATED" } }), 1);
  await db.syncLease.create({ data: { id: "bank-sync", token: "other", expiresAt: new Date(Date.now() + 60000) } });
  await assert.rejects(synchronize("test"), SyncBusy);
  await db.syncLease.deleteMany();
  const input = { requestId: randomUUID(), fromFundId: fund.id, toFundId: paused.id, amount: 10000n, reason: "test transfer" };
  const before = await fundTotals();
  const transfer = await transferFunds(input, "test"); await transferFunds(input, "test");
  assert.equal(await db.transfer.count(), 1);
  const after = await fundTotals();
  assert.equal(after.reduce((n,f) => n + f.balance, 0n), before.reduce((n,f) => n + f.balance, 0n));
  assert.equal(after.reduce((n,f) => n + f.income, 0n), before.reduce((n,f) => n + f.income, 0n));
  assert.equal(after.reduce((n,f) => n + f.expense, 0n), before.reduce((n,f) => n + f.expense, 0n));
  await assert.rejects(transferFunds({ ...input, amount: 10001n }, "test"), /nội dung khác/);
  await assert.rejects(transferFunds({ ...input, requestId: randomUUID(), toFundId: another.id }, "test"), /cùng tài khoản/);
  await assert.rejects(transferFunds({ ...input, requestId: randomUUID(), amount: 99999999999n }, "test"), /không đủ/);
  await reverseFundTransfer(transfer.id, "test reversal", "test");
  await assert.rejects(reverseFundTransfer(transfer.id, "test reversal twice", "test"), /đã được đảo/);
  const concurrent = await Promise.allSettled([0,1].map(() => transferFunds({ ...input, requestId: randomUUID(), amount: 800000n }, "test")));
  assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 1, "Concurrent spending must not overdraw");
  for (const summary of await accountTotals()) assert.equal(summary.unexplained, 0n);
  console.log("PASS: PostgreSQL sync paging/resume/dedup/update, manual assignment, lease, transfer idempotency/reversal/concurrency, ledger reconciliation");
} finally {
  globalThis.fetch = originalFetch;
  await clean(); await db.$disconnect();
}
