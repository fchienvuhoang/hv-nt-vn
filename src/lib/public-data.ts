import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { fundTotals } from "./ledger";
import { maskPhones } from "./domain";
export const PUBLIC_TAG = "public-ledger";
const options = { revalidate: 1200, tags: [PUBLIC_TAG] };
export const publicFunds = unstable_cache(async () => {
  const funds = await fundTotals();
  return funds.filter(f => f.account.finalizedAt).map(f => ({ id: f.id, code: f.code, name: maskPhones(f.name), slug: f.slug, description: maskPhones(f.description), status: f.status,
    account: f.account.number, income: f.income.toString(), expense: f.expense.toString(), balance: f.balance.toString(), count: f.count }));
}, ["public-funds-v1"], options);
export const publicFund = unstable_cache(async (slug: string, page: number, direction: "CREDIT" | "DEBIT") => {
  const fund = await db.fund.findUnique({ where: { slug }, include: { account: true } });
  if (!fund?.account.finalizedAt) return null;
  const where = { fundId: fund.id, direction };
  const [summary, rows, count, transfers, sync] = await Promise.all([
    fundTotals(), db.bankTransaction.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * 30, take: 30 }),
    db.bankTransaction.count({ where }),
    db.transfer.findMany({ where: { OR: [{ fromFundId: fund.id }, { toFundId: fund.id }] }, include: { fromFund: { select: { code: true } }, toFund: { select: { code: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.syncState.findMany({ where: { accountId: fund.accountId }, select: { lastSuccessAt: true, direction: true } }),
  ]);
  const total = summary.find(f => f.id === fund.id)!;
  return {
    code: fund.code, name: maskPhones(fund.name), slug, description: maskPhones(fund.description), status: fund.status, account: fund.account.number,
    income: total.income.toString(), expense: total.expense.toString(), balance: total.balance.toString(),
    transferIn: total.transferIn.toString(), transferOut: total.transferOut.toString(), openingTransferNet: fund.openingTransferNet.toString(),
    openingIncome: fund.openingIncome.toString(), openingExpense: fund.openingExpense.toString(), cutover: fund.account.cutoverAt?.toISOString(),
    rows: rows.map(r => ({ id: r.id, amount: r.amount.toString(), at: r.occurredAt.toISOString(), narrative: r.hiddenNarrative ? "Nội dung được ẩn theo nguồn sao kê" : maskPhones(r.narrative), name: maskPhones(r.displayName) })),
    count, transfers: transfers.map(t => ({ id: t.id, from: t.fromFund.code, to: t.toFund.code, amount: t.amount.toString(), reason: maskPhones(t.reason), at: t.createdAt.toISOString(), reversal: !!t.reversalOf })),
    syncAt: sync.length === 2 && sync.every(s => s.lastSuccessAt) ? new Date(Math.min(...sync.map(s => s.lastSuccessAt!.getTime()))).toISOString() : null,
    generatedAt: new Date().toISOString(),
  };
}, ["public-fund-v1"], options);
