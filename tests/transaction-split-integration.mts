import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (url.hostname !== "localhost" || !url.pathname.startsWith("/hvntvn_test_split")) throw new Error("Require isolated split test database");
const { db } = await import("../src/lib/db");
const { splitTransaction } = await import("../src/lib/transaction-split");
const { originalReceiptMembership, originalReceiptTotals } = await import("../src/lib/public-original-transactions");
const { accountTotals, fundTotals, serializable } = await import("../src/lib/ledger");
const { fundShare } = await import("../src/lib/allocation");
const { originalFundShare } = await import("../src/lib/transaction-split-input");
const { previewAllocationTransfer, commitAllocationTransfer } = await import("../src/lib/allocation-transfers");
const { moveShare } = await import("../src/lib/allocation-write");
const { reassignTransactions } = await import("../src/lib/transaction-management");
const { mutationFundScope } = await import("../src/lib/admin-mutation-scope");
const { ingestBankPage } = await import("../src/lib/ingest-bank");
const actor = { id: "split-qa", name: "Split QA", email: "split@example.test" };
if (await db.bankAccount.count()) throw new Error("Require empty test database");
try {
  const account = await db.bankAccount.create({ data: { number: "0572", owner: "QA", label: "QA" } });
  const other = await db.bankAccount.create({ data: { number: "0856", owner: "QA", label: "QA" } });
  const funds = await Promise.all(["TPA", "TPB", "TPC"].map(code => db.fund.create({ data: { code, name: code, slug: code.toLowerCase(), accountId: account.id, keywords: [] } })));
  const wrong = await db.fund.create({ data: { code: "WRONG", name: "WRONG", slug: "wrong", accountId: other.id, keywords: [] } });
  const create = (direction: "CREDIT" | "DEBIT", amount: bigint, fundId: string | null = null) => db.bankTransaction.create({ data: { sourceId: randomUUID(), accountId: account.id, fundId, direction, amount, narrative: "QA nguyên bản", displayName: "QA", refId: "REF", occurredAt: new Date(), sourceHash: "QA", source: { test: true } } });
  const row = await create("CREDIT", 1000000n);
  const request = { requestId: randomUUID(), transactionId: row.id, updatedAt: row.updatedAt.toISOString(), reason: "Chia theo yêu cầu thí chủ", shares: [{ fundId: funds[0].id, amount: "600000" }, { fundId: funds[1].id, amount: "400000" }] };
  const bankSnapshot = () => db.bankTransaction.findMany({ select: { id: true, accountId: true, amount: true, direction: true, source: true, sourceId: true, narrative: true, occurredAt: true } });
  const before = await bankSnapshot();
  await Promise.all([splitTransaction(request, actor), splitTransaction(request, actor)]);
  assert.deepEqual(await bankSnapshot(), before);
  assert.equal(await db.transactionNote.count({ where: { kind: "DIRECT_SPLIT" } }), 1);
  assert.equal(await db.auditLog.count({ where: { action: "TRANSACTION_SPLIT" } }), 1);
  const getRow = () => db.bankTransaction.findUniqueOrThrow({ where: { id: row.id }, include: { allocations: true } });
  let current = await getRow();
  assert.equal(fundShare(current, funds[0].id), 600000n);
  assert.equal(fundShare(current, funds[1].id), 400000n);
  let totals = await fundTotals();
  assert.equal(totals.find(f => f.id === funds[0].id)!.income, 600000n);
  assert.equal(totals.find(f => f.id === funds[1].id)!.income, 400000n);
  let bank = (await accountTotals()).find(a => a.id === account.id)!;
  assert.equal(bank.income, 1000000n); assert.equal(bank.expected, 1000000n); assert.equal(bank.unallocated, 0n);
  for (const fund of funds.slice(0, 2)) {
    const where = { AND: [originalReceiptMembership(fund.id), { entryStatus: "POSTED" }] };
    const rows = await db.bankTransaction.findMany({ where });
    assert.equal(rows.length, 1);
    const expected = fund.id === funds[0].id ? 600000n : 400000n;
    assert.equal(originalFundShare(rows[0], fund.id), expected);
    assert.equal((await originalReceiptTotals(db, where, fund.id)).find(t => t.direction === "CREDIT")!._sum.amount, expected);
  }
  const scope = await mutationFundScope("transactions/split", new Request("http://localhost/api/admin/transactions/split", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...request, shares: [{ fundId: funds[1].id, amount: "100000" }, { fundId: funds[2].id, amount: "900000" }] }) }));
  assert.deepEqual(new Set(scope), new Set(funds.map(f => f.id)));
  await assert.rejects(splitTransaction({ ...request, requestId: randomUUID() }, actor), /vừa thay đổi/);
  await assert.rejects(splitTransaction({ ...request, reason: "Different request body" }, actor), /đã được dùng/);
  const fresh = { ...request, requestId: randomUUID(), updatedAt: current.updatedAt.toISOString() };
  for (const shares of [[{ fundId: funds[0].id, amount: "1" }, { fundId: funds[1].id, amount: "1" }], [{ fundId: funds[0].id, amount: "600000" }, { fundId: wrong.id, amount: "400000" }]]) await assert.rejects(splitTransaction({ ...fresh, shares }, actor));
  assert.equal(await db.fundAllocation.count(), 2);
  const debit = await create("DEBIT", 100000n, funds[0].id);
  await splitTransaction({ ...request, requestId: randomUUID(), transactionId: debit.id, updatedAt: debit.updatedAt.toISOString(), shares: [{ fundId: funds[0].id, amount: "75000" }, { fundId: funds[1].id, amount: "25000" }] }, actor);
  totals = await fundTotals(); assert.equal(totals.find(f => f.id === funds[0].id)!.expense, 75000n); assert.equal(totals.find(f => f.id === funds[1].id)!.expense, 25000n);
  bank = (await accountTotals()).find(a => a.id === account.id)!; assert.equal(bank.expected, 900000n); assert.equal(bank.expense, 100000n);
  // A subsequent internal transfer changes current balances, never original public receipts.
  await serializable(tx => moveShare(tx, current, funds[0].id, funds[2].id, 50000n, actor));
  current = await getRow(); assert.equal(fundShare(current, funds[0].id), 550000n); assert.equal(originalFundShare(current, funds[0].id), 600000n);
  assert.equal((await db.bankTransaction.findMany({ where: originalReceiptMembership(funds[2].id) })).length, 0);
  // Reassignment without transfer history updates the initial direct split as a deliberate correction.
  await reassignTransactions({ requestId: randomUUID(), sourceFundId: funds[1].id, targetFundId: funds[0].id, reason: "Sửa phần phân bổ theo thí chủ", rows: [{ id: debit.id, updatedAt: (await db.bankTransaction.findUniqueOrThrow({ where: { id: debit.id } })).updatedAt.toISOString() }] }, actor);
  const corrected = await db.bankTransaction.findUniqueOrThrow({ where: { id: debit.id } });
  assert.equal(originalFundShare(corrected, funds[0].id), 100000n); assert.equal(originalFundShare(corrected, funds[1].id), 0n);
  // Source corrections cannot silently leave direct shares with the wrong total/direction.
  await assert.rejects(serializable(tx => ingestBankPage(tx, account.id, [{ id: row.sourceId, bankAccountId: account.number, type: "CREDIT", transactionAmount: 999999, transactionTime: new Date().toISOString(), narrative: row.narrative }], actor.email)), /thay đổi số tiền/);
  const transferInput={fromFundId:funds[1].id,toFundId:funds[2].id,mode:"AMOUNT" as const,value:"10000",reason:"Điều chuyển sau khi chia giao dịch"};
  const preview=await previewAllocationTransfer(transferInput);
  await commitAllocationTransfer({...transferInput,requestId:randomUUID(),fingerprint:preview.fingerprint},actor);
  current=await getRow();
  assert.equal(fundShare(current,funds[1].id),390000n);
  assert.equal(originalFundShare(current,funds[1].id),400000n);
  await assert.rejects(splitTransaction({...request,requestId:randomUUID(),updatedAt:current.updatedAt.toISOString()},actor),/đã tham gia điều chuyển/);
  const reviewed = await create("CREDIT", 100n);
  await db.bankTransaction.update({ where: { id: reviewed.id }, data: { entryStatus: "REVIEW" } });
  await assert.rejects(splitTransaction({ ...request, requestId: randomUUID(), transactionId: reviewed.id, updatedAt: reviewed.updatedAt.toISOString() }, actor), /đã ghi nhận/);
  console.log("PASS: exact credit/debit splits, original receipt shares, immutable bank data, concurrent idempotency, audit, stale/account/amount/status rejection, reassignment and source correction safety, cache scope, conserved account totals");
} finally {
  await db.transfer.deleteMany({where:{reversalOf:{not:null}}}); await db.transfer.deleteMany();
  await db.auditLog.deleteMany(); await db.bankTransaction.deleteMany(); await db.fund.deleteMany(); await db.bankAccount.deleteMany(); await db.$disconnect();
}
