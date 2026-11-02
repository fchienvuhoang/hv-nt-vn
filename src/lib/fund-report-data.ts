import "server-only";
import { db } from "./db";
import { fundTotals } from "./ledger";
import { fundActivity } from "./fund-activity";
import { localDate, startOfVietnamDay } from "./domain";

export async function loadFundReportData(generatedAt = new Date()) {
  const end = startOfVietnamDay(localDate(generatedAt)), start = new Date(end.getTime() - 86400000);
  return db.$transaction(async tx => {
    const funds = await fundTotals(tx);
    const daily = await fundActivity({ date: localDate(start), allTime: false, fundId: "", account: "" }, tx);
    const expenses = await tx.bankTransaction.findMany({
      where: { entryStatus: "POSTED", direction: "DEBIT", occurredAt: { gte: start, lt: end }, notes: { none: { kind: "SOURCE_DATE_MISSING" } } },
      select: { occurredAt: true, amount: true, narrative: true, assignment: true, matchReason: true, account: { select: { number: true } }, fund: { select: { code: true } }, allocations: { select: { amount: true, fund: { select: { code: true } } } } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    const states = await tx.syncState.findMany({ select: { lastSuccessAt: true } });
    const accountCount = await tx.bankAccount.count();
    const counts = await tx.bankTransaction.groupBy({ by: ["direction"], where: { entryStatus: "POSTED", OR: [{ fundId: { not: null } }, { allocations: { some: {} } }] }, _count: true });
    return {
      funds, generatedAt,
      syncAt: accountCount > 0 && states.length === accountCount * 2 && states.every(state => state.lastSuccessAt) ? new Date(Math.min(...states.map(state => state.lastSuccessAt!.getTime()))) : null,
      yesterday: new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(start),
      yesterdayIncome: daily.total.income.amount, yesterdayExpense: daily.total.expense.amount, yesterdayIncomeCount: daily.total.income.count, yesterdayExpenseCount: daily.total.expense.count,
      lifetimeIncomeCount: counts.find(group => group.direction === "CREDIT")?._count ?? 0,
      lifetimeExpenseCount: counts.find(group => group.direction === "DEBIT")?._count ?? 0,
      yesterdayFunds: daily.funds.map(fund => ({ code: fund.code, name: fund.name, income: fund.income.amount, expense: fund.expense.amount, incomeCount: fund.income.count, expenseCount: fund.expense.count })),
      expenses: expenses.map(row => ({ at: row.occurredAt, account: row.account.number, amount: row.amount, narrative: row.narrative, assignment: row.assignment, reason: row.matchReason, funds: row.allocations.length ? row.allocations.map(part => ({ code: part.fund.code, amount: part.amount })) : row.fund ? [{ code: row.fund.code, amount: row.amount }] : [] })),
      website: process.env.AUTH_URL || undefined,
    };
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}
