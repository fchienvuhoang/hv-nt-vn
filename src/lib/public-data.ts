import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { fundTotals } from "./ledger";
import { maskPhones } from "./domain";
import { matchesPublicTransaction } from "./public-search";
export const PUBLIC_PAGE_SIZE = 100;
export const PUBLIC_TAG = "public-ledger";
const options = { revalidate: 1200, tags: [PUBLIC_TAG] };
const publicFundSummary = unstable_cache(
  async (slug: string, direction: "CREDIT" | "DEBIT") => {
    const fund = await db.fund.findUnique({
      where: { slug },
      include: { account: true },
    });
    if (!fund) return null;
    const bankAccounts = await db.bankAccount.findMany({where:{id:{in:[fund.accountId,...fund.accountIds]}},select:{id:true,number:true}});
    const where = { fundId: fund.id, direction, entryStatus: "POSTED" };
    const [summary, count, transfers, sync] = await Promise.all([
      fundTotals(),
      db.bankTransaction.count({ where }),
      db.transfer.findMany({
        where: { OR: [{ fromFundId: fund.id }, { toFundId: fund.id }] },
        include: {
          fromFund: { select: { code: true } },
          toFund: { select: { code: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.syncState.findMany({
        where: { accountId: { in: bankAccounts.map(a => a.id) } },
        select: { lastSuccessAt: true, direction: true },
      }),
    ]);
    const total = summary.find((f) => f.id === fund.id)!;
    return {
      code: fund.code,
      name: maskPhones(fund.name),
      slug,
      description: maskPhones(fund.description),
      status: fund.status,
      account: bankAccounts.map(a=>a.number).join(" · "),
      pendingImports: await db.fundImport.count({
        where: { fundId: fund.id, status: "RUNNING" },
      }),
      income: total.income.toString(),
      expense: total.expense.toString(),
      balance: total.balance.toString(),
      transferIn: total.transferIn.toString(),
      transferOut: total.transferOut.toString(),
      openingTransferNet: fund.openingTransferNet.toString(),
      openingIncome: fund.openingIncome.toString(),
      openingExpense: fund.openingExpense.toString(),
      cutover: fund.account.syncFrom?.toISOString(),
      id: fund.id,
      count,
      transfers: transfers.map((t) => ({
        id: t.id,
        from: t.fromFund.code,
        to: t.toFund.code,
        amount: t.amount.toString(),
        reason: maskPhones(t.reason),
        at: t.createdAt.toISOString(),
        reversal: !!t.reversalOf,
      })),
      syncAt:
        sync.length === bankAccounts.length * 2 && sync.every((s) => s.lastSuccessAt)
          ? new Date(
              Math.min(...sync.map((s) => s.lastSuccessAt!.getTime())),
            ).toISOString()
          : null,
      generatedAt: new Date().toISOString(),
    };
  },
  ["public-fund-summary-v5"],
  options,
);

// Cache public, masked rows by stable page, never by a visitor's search term.
const publicTransactionPage = unstable_cache(async (fundId: string, direction: "CREDIT" | "DEBIT", page: number) => {
  const rows = await db.bankTransaction.findMany({
    where:{fundId,direction,entryStatus:"POSTED"},
    select:{id:true,amount:true,occurredAt:true,narrative:true,hiddenNarrative:true,displayName:true,account:{select:{number:true}},notes:{select:{id:true,text:true,createdAt:true},orderBy:[{createdAt:"asc"},{id:"asc"}]}},
    orderBy:[{occurredAt:"desc"},{id:"desc"}],skip:(page-1)*PUBLIC_PAGE_SIZE,take:PUBLIC_PAGE_SIZE,
  });
  return rows.map(r=>({id:r.id,account:r.account.number,amount:r.amount.toString(),at:r.occurredAt.toISOString(),
    notes:r.notes.map(n=>({id:n.id,text:maskPhones(n.text),at:n.createdAt.toISOString()})),narrative:r.hiddenNarrative?"Nội dung được ẩn theo nguồn sao kê":maskPhones(r.narrative),name:maskPhones(r.displayName)}));
},["public-transaction-page-v2"],options);

export async function publicFund(slug: string, page: number, direction: "CREDIT" | "DEBIT", search = "") {
  const fund=await publicFundSummary(slug,direction);
  if(!fund)return null;
  const query=search.trim().slice(0,100);
  const requestedPage=Math.max(1,Math.floor(page)||1);
  if(!query){
    const currentPage=Math.min(requestedPage,Math.max(1,Math.ceil(fund.count/PUBLIC_PAGE_SIZE)));
    return {...fund,page:currentPage,rows:await publicTransactionPage(fund.id,direction,currentPage)};
  }
  const matches: Awaited<ReturnType<typeof publicTransactionPage>>=[];
  const pages=Math.ceil(fund.count/PUBLIC_PAGE_SIZE);
  // Bound parallel cache misses to protect the connection pool on a cold cache.
  for(let first=1;first<=pages;first+=3){
    const batches=await Promise.all(Array.from({length:Math.min(3,pages-first+1)},(_,i)=>publicTransactionPage(fund.id,direction,first+i)));
    for(const rows of batches)matches.push(...rows.filter(row=>matchesPublicTransaction(row,query)));
  }
  const currentPage=Math.min(requestedPage,Math.max(1,Math.ceil(matches.length/PUBLIC_PAGE_SIZE)));
  return {...fund,page:currentPage,count:matches.length,rows:matches.slice((currentPage-1)*PUBLIC_PAGE_SIZE,currentPage*PUBLIC_PAGE_SIZE)};
}
