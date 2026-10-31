import "server-only";
import { db } from "./db";
import { openingBalance } from "./domain";
import type { Prisma } from "@/generated/prisma/client";
export type LedgerClient = Prisma.TransactionClient;
export async function fundTotals(client: LedgerClient = db) {
  const [funds, movements, sent, received] = await Promise.all([
    client.fund.findMany({ include: { account: true }, orderBy: [{ status: "asc" }, { code: "asc" }] }),
    client.bankTransaction.groupBy({ by: ["fundId", "direction"], where: { fundId: { not: null } }, _sum: { amount: true }, _count: true }),
    client.transfer.groupBy({ by: ["fromFundId"], _sum: { amount: true } }),
    client.transfer.groupBy({ by: ["toFundId"], _sum: { amount: true } }),
  ]);
  return funds.map(fund => {
    const txs = movements.filter(t => t.fundId === fund.id);
    const income = txs.find(t => t.direction === "CREDIT")?._sum.amount ?? 0n;
    const expense = txs.find(t => t.direction === "DEBIT")?._sum.amount ?? 0n;
    const transferOut = sent.find(t => t.fromFundId === fund.id)?._sum.amount ?? 0n;
    const transferIn = received.find(t => t.toFundId === fund.id)?._sum.amount ?? 0n;
    return { ...fund, income: income + fund.openingIncome, expense: expense + fund.openingExpense, transferIn, transferOut,
      balance: openingBalance(fund) + income - expense + transferIn - transferOut, count: txs.reduce((n, t) => n + t._count, 0) };
  });
}
export async function accountTotals() {
  const [accounts, funds, txs] = await Promise.all([
    db.bankAccount.findMany({ orderBy: { number: "asc" } }), fundTotals(),
    db.bankTransaction.groupBy({ by: ["accountId", "direction", "fundId"], _sum: { amount: true }, _count: true }),
  ]);
  return accounts.map(account => {
    const movements = txs.filter(t => t.accountId === account.id);
    const income = movements.filter(t => t.direction === "CREDIT").reduce((n,t) => n + (t._sum.amount ?? 0n), 0n);
    const expense = movements.filter(t => t.direction === "DEBIT").reduce((n,t) => n + (t._sum.amount ?? 0n), 0n);
    const pending = movements.filter(t => t.fundId === null);
    const unallocated = account.openingUnallocated + pending.reduce((n,t) => n + (t.direction === "CREDIT" ? 1n : -1n) * (t._sum.amount ?? 0n), 0n);
    const fundBalance = funds.filter(f => f.accountId === account.id).reduce((n,f) => n + f.balance, 0n);
    const expected = account.openingBankBalance + income - expense;
    return { ...account, income, expense, unallocated, fundBalance, expected,
      pendingCount: pending.reduce((n,t) => n + t._count,0),
      // This should always be zero after a finalized opening.
      unexplained: expected - fundBalance - unallocated - account.openingDifference };
  });
}
export async function serializable<T>(fn: (tx: LedgerClient) => Promise<T>, deadline?: number): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const timeout = deadline ? Math.min(20000, deadline - Date.now()) : 20000;
    if (timeout < 500) throw new Error("Hết ngân sách xử lý; dữ liệu sẽ tiếp tục ở lượt sau");
    try { return await db.$transaction(fn, { isolationLevel: "Serializable", timeout }); }
    catch (error) {
      if (attempt < 2 && typeof error === "object" && error !== null && "code" in error && error.code === "P2034") continue;
      throw error;
    }
  }
}
