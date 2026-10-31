import "server-only";
import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";
export type LedgerClient = Prisma.TransactionClient;
export async function fundTotals(client: LedgerClient = db) {
  const [funds, movements, sent, received] = await Promise.all([
    client.fund.findMany({
      include: { account: true },
      orderBy: [{ status: "asc" }, { code: "asc" }],
    }),
    client.bankTransaction.groupBy({
      by: ["fundId", "accountId", "direction"],
      where: { fundId: { not: null }, entryStatus: "POSTED" },
      _sum: { amount: true },
      _count: true,
    }),
    client.transfer.groupBy({
      by: ["fromFundId", "accountId"],
      _sum: { amount: true },
    }),
    client.transfer.groupBy({
      by: ["toFundId", "accountId"],
      _sum: { amount: true },
    }),
  ]);
  return funds.map((fund) => {
    const txs = movements.filter((t) => t.fundId === fund.id),
      out = sent.filter((t) => t.fromFundId === fund.id),
      into = received.filter((t) => t.toFundId === fund.id);
    const ids = [
      ...new Set([
        fund.accountId,
        ...fund.accountIds,
        ...txs.map((t) => t.accountId),
        ...out.map((t) => t.accountId ?? fund.accountId),
        ...into.map((t) => t.accountId ?? fund.accountId),
      ]),
    ];
    const byAccount = ids.map((accountId) => {
      const primary = accountId === fund.accountId,
        own = txs.filter((t) => t.accountId === accountId);
      const income =
        (own.find((t) => t.direction === "CREDIT")?._sum.amount ?? 0n) +
        (primary ? fund.openingIncome : 0n);
      const expense =
        (own.find((t) => t.direction === "DEBIT")?._sum.amount ?? 0n) +
        (primary ? fund.openingExpense : 0n);
      const transferOut = out
        .filter((t) => (t.accountId ?? fund.accountId) === accountId)
        .reduce((n, t) => n + (t._sum.amount ?? 0n), 0n);
      const transferIn = into
        .filter((t) => (t.accountId ?? fund.accountId) === accountId)
        .reduce((n, t) => n + (t._sum.amount ?? 0n), 0n);
      return {
        accountId,
        income,
        expense,
        transferIn,
        transferOut,
        balance:
          income -
          expense +
          transferIn -
          transferOut +
          (primary ? fund.openingTransferNet : 0n),
        count: own.reduce((n, t) => n + t._count, 0),
      };
    });
    return {
      ...fund,
      byAccount,
      income: byAccount.reduce((n, a) => n + a.income, 0n),
      expense: byAccount.reduce((n, a) => n + a.expense, 0n),
      balance: byAccount.reduce((n, a) => n + a.balance, 0n),
      transferIn: byAccount.reduce((n, a) => n + a.transferIn, 0n),
      transferOut: byAccount.reduce((n, a) => n + a.transferOut, 0n),
      count: byAccount.reduce((n, a) => n + a.count, 0),
    };
  });
}
export async function accountTotals() {
  const [accounts, funds, txs, reviews] = await Promise.all([
    db.bankAccount.findMany({ orderBy: { number: "asc" } }),
    fundTotals(),
    db.bankTransaction.groupBy({
      by: ["accountId", "direction", "fundId"],
      where: { entryStatus: "POSTED" },
      _sum: { amount: true },
      _count: true,
    }),
    db.bankTransaction.groupBy({
      by: ["accountId"],
      where: { entryStatus: "REVIEW" },
      _count: true,
    }),
  ]);
  return accounts.map((account) => {
    const owned = funds.filter((f) => f.accountId === account.id),
      movements = txs.filter((t) => t.accountId === account.id),
      pending = movements.filter((t) => t.fundId === null);
    const income =
      movements
        .filter((t) => t.direction === "CREDIT")
        .reduce((n, t) => n + (t._sum.amount ?? 0n), 0n) +
      owned.reduce((n, f) => n + f.openingIncome, 0n);
    const expense =
      movements
        .filter((t) => t.direction === "DEBIT")
        .reduce((n, t) => n + (t._sum.amount ?? 0n), 0n) +
      owned.reduce((n, f) => n + f.openingExpense, 0n);
    const unallocated =
      account.openingUnallocated +
      account.openingDifference +
      pending.reduce(
        (n, t) =>
          n + (t.direction === "CREDIT" ? 1n : -1n) * (t._sum.amount ?? 0n),
        0n,
      );
    const fundBalance = funds.reduce(
      (n, f) =>
        n +
        (f.byAccount.find((a) => a.accountId === account.id)?.balance ?? 0n),
      0n,
    );
    return {
      ...account,
      income,
      expense,
      unallocated,
      fundBalance,
      expected: fundBalance + unallocated,
      pendingCount: pending.reduce((n, t) => n + t._count, 0),
      reviewCount: reviews.find((r) => r.accountId === account.id)?._count ?? 0,
      unexplained: 0n,
    };
  });
}
export async function serializable<T>(
  fn: (tx: LedgerClient) => Promise<T>,
  deadline?: number,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const timeout = deadline ? Math.min(20000, deadline - Date.now()) : 20000;
    if (timeout < 500)
      throw new Error("Hết ngân sách xử lý; dữ liệu sẽ tiếp tục ở lượt sau");
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        timeout,
      });
    } catch (error) {
      if (
        attempt < 2 &&
        typeof error === "object" &&
        error !== null &&
        (("cause" in error && typeof error.cause === "object" && error.cause !== null && "kind" in error.cause && error.cause.kind === "TransactionWriteConflict") ||
        ("code" in error && (error.code === "P2034" ||
          (error.code === "P2010" &&
            "meta" in error &&
            JSON.stringify(error.meta).includes("TransactionWriteConflict")))))
      )
        continue;
      throw error;
    }
  }
}
