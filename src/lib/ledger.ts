import "server-only";
import {splitBalance,summarizeBalances} from "./balance-summary";
import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";
export type LedgerClient = Prisma.TransactionClient;
export async function fundTotals(client: LedgerClient = db, fundId?: string, before?:Date) {
  const [funds, baseMovements, sent, received, allocations, balanceItems] = await Promise.all([
    client.fund.findMany({
      where: fundId ? { id: fundId } : undefined,
      include: { account: true },
      orderBy: [{ status: "asc" }, { code: "asc" }],
    }),
    client.bankTransaction.groupBy({
      by: ["fundId", "accountId", "direction", "entryStatus"],
      where: { fundId: fundId ?? { not: null }, entryStatus: {in:["POSTED","OPENING"]}, allocations:{none:{}}, ...(before?{OR:[{entryStatus:"OPENING"},{occurredAt:{lt:before}}]}:{}) },
      _sum: { amount: true },
      _min: {occurredAt:true},
      _count: true,
    }),
    client.transfer.groupBy({
      by: ["fromFundId", "accountId"],
      where:{...(before?{createdAt:{lt:before}}:{}),mode:"BALANCE", ...(fundId ? {fromFundId:fundId} : {})},
      _sum: { amount: true },
    }),
    client.transfer.groupBy({
      by: ["toFundId", "accountId"],
      where:{...(before?{createdAt:{lt:before}}:{}),mode:"BALANCE", ...(fundId ? {toFundId:fundId} : {})},
      _sum: { amount: true },
    }),
    Promise.all((["CREDIT","DEBIT"] as const).map(async direction=>(await client.fundAllocation.groupBy({by:["fundId","accountId"],where:{...(fundId?{fundId}:{}),transaction:{entryStatus:"POSTED",direction,...(before?{occurredAt:{lt:before}}:{})}},_sum:{amount:true},_count:true})).map(a=>({...a,direction})))).then(groups=>groups.flat()),
    client.transferBalanceItem.findMany({where:{transfer:{...(before?{createdAt:{lt:before}}:{}),...(fundId?{OR:[{fromFundId:fundId},{toFundId:fundId}]}:{})}},include:{transfer:{select:{fromFundId:true,toFundId:true}}}}),
  ]);
  for(const item of balanceItems){
    sent.push({fromFundId:item.transfer.fromFundId,accountId:item.accountId,_sum:{amount:item.amount}});
    received.push({toFundId:item.transfer.toFundId,accountId:item.accountId,_sum:{amount:item.amount}});
  }
  const grouped=new Map<string,{fundId:string|null;accountId:string;direction:"CREDIT"|"DEBIT";entryStatus:string;openingAt:Date|null;_sum:{amount:bigint};_count:number}>();
  for(const row of [...baseMovements,...allocations.map(a=>({fundId:a.fundId,accountId:a.accountId,direction:a.direction,_sum:a._sum,_count:a._count,entryStatus:"POSTED",_min:{occurredAt:null}}))]){
    const key=JSON.stringify([row.fundId,row.accountId,row.direction,row.entryStatus]),old=grouped.get(key);
    grouped.set(key,{fundId:row.fundId,accountId:row.accountId,direction:row.direction,entryStatus:row.entryStatus,openingAt:row.entryStatus==="OPENING"?row._min.occurredAt:null,_sum:{amount:(old?._sum.amount??0n)+(row._sum.amount??0n)},_count:(old?._count??0)+row._count});
  }
  const movements=[...grouped.values()];
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
        own.filter(t=>t.direction==="CREDIT").reduce((n,t)=>n+t._sum.amount,0n) +
        (primary ? fund.openingIncome : 0n);
      const expense =
        own.filter(t=>t.direction==="DEBIT").reduce((n,t)=>n+t._sum.amount,0n) +
        (primary ? fund.openingExpense : 0n);
      const transferOut = out
        .filter((t) => (t.accountId ?? fund.accountId) === accountId)
        .reduce((n, t) => n + (t._sum.amount ?? 0n), 0n);
      const transferIn = into
        .filter((t) => (t.accountId ?? fund.accountId) === accountId)
        .reduce((n, t) => n + (t._sum.amount ?? 0n), 0n);
      const openingBalance=own.filter(t=>t.entryStatus==="OPENING").reduce((sum,t)=>sum+(t.direction==="CREDIT"?1n:-1n)*t._sum.amount,0n);
      const balance=income-expense+transferIn-transferOut+(primary?fund.openingTransferNet:0n);
      return {
        accountId,
        ...splitBalance(balance),
        openingBalance,
        openingAt:own.find(t=>t.entryStatus==="OPENING")?.openingAt??null,
        income,
        expense,
        fundingIncome: income+transferIn-transferOut+(primary?fund.openingTransferNet:0n),
        transferIn,
        transferOut,
        balance,
        count: own.reduce((n, t) => n + t._count, 0),
      };
    });
    return {
      ...fund,
      byAccount,
      openingBalance: byAccount.reduce((n,a)=>n+a.openingBalance,0n),
      income: byAccount.reduce((n, a) => n + a.income, 0n),
      fundingIncome: byAccount.reduce((n,a)=>n+a.fundingIncome,0n),
      expense: byAccount.reduce((n, a) => n + a.expense, 0n),
      balance: byAccount.reduce((n, a) => n + a.balance, 0n),
      ...splitBalance(byAccount.reduce((n,a)=>n+a.balance,0n)),
      transferIn: byAccount.reduce((n, a) => n + a.transferIn, 0n),
      transferOut: byAccount.reduce((n, a) => n + a.transferOut, 0n),
      count: byAccount.reduce((n, a) => n + a.count, 0),
      postedIncomeCount:txs.filter(t=>t.direction==="CREDIT"&&t.entryStatus==="POSTED").reduce((n,t)=>n+t._count,0),
      postedExpenseCount:txs.filter(t=>t.direction==="DEBIT"&&t.entryStatus==="POSTED").reduce((n,t)=>n+t._count,0),
      statementCount:txs.reduce((n,t)=>n+t._count,0),
      statementIncomeCount:txs.filter(t=>t.direction==="CREDIT").reduce((n,t)=>n+t._count,0),
      statementExpenseCount:txs.filter(t=>t.direction==="DEBIT").reduce((n,t)=>n+t._count,0),
      incomeCount:txs.filter(t=>t.direction==="CREDIT").reduce((n,t)=>n+t._count,0),
      expenseCount:txs.filter(t=>t.direction==="DEBIT").reduce((n,t)=>n+t._count,0),
    };
  });
}
export async function accountTotals(preloadedFunds?: Awaited<ReturnType<typeof fundTotals>>) {
  const [accounts, funds, txs, reviews] = await Promise.all([
    db.bankAccount.findMany({ orderBy: { number: "asc" } }),
    preloadedFunds ? Promise.resolve(preloadedFunds) : fundTotals(),
    db.bankTransaction.groupBy({
      by: ["accountId", "direction", "fundId"],
      where: { entryStatus: {in:["POSTED","OPENING"]} },
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
    const fundParts=summarizeBalances(funds.map(f=>({balance:f.byAccount.find(a=>a.accountId===account.id)?.balance??0n})));
    return {
      ...account,
      fundAvailableBalance:fundParts.availableBalance,
      fundExcessExpense:fundParts.excessExpense,
      income,
      expense,
      unallocated,
      fundBalance,
      openingBalance:funds.reduce((sum,f)=>sum+(f.byAccount.find(a=>a.accountId===account.id)?.openingBalance??0n),0n),
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
