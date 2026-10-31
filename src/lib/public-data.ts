import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { fundTotals } from "./ledger";
import { maskPhones,normalize } from "./domain";
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

export type PublicFundDTO=Omit<NonNullable<Awaited<ReturnType<typeof publicFund>>>,"id"|"cutover">;
export async function publicFundTitle(slug:string){
  const fund=await publicFundSummary(slug,"CREDIT");
  if(!fund)return null;
  const name=fund.name.trim();
  const hasCode=new RegExp(`^${fund.code}(?=$|[\\s:–—-])`,"i").test(name);
  return `${hasCode?name:`${fund.code} ${name}`} - Học viện nguyên thủy Việt Nam`;
}
export function publicFundDTO(fund:NonNullable<Awaited<ReturnType<typeof publicFund>>>):PublicFundDTO {
  const {id,cutover,...result}=fund;void id;void cutover;return result;
}

const DIRECTORY_PAGE_SIZE=12,SEARCH_BLOCK_SIZE=250;
const directoryFunds=unstable_cache(async()=>{
  const totals=await fundTotals();
  return totals.filter(f=>f.status==="ACTIVE"&&f.publicListed).map(f=>({id:f.id,slug:f.slug,code:f.code,name:maskPhones(f.name),description:maskPhones(f.description),income:f.income.toString(),expense:f.expense.toString(),balance:f.balance.toString(),count:f.count}));
},["public-directory-funds-v2"],options);
// Cache stable masked blocks, not arbitrary visitor search strings.
const directoryTransactionBlock=unstable_cache(async(page:number)=>{
 const rows=await db.bankTransaction.findMany({where:{entryStatus:"POSTED",fund:{status:"ACTIVE",publicListed:true}},select:{fundId:true,amount:true,direction:true,occurredAt:true,narrative:true,hiddenNarrative:true,displayName:true,account:{select:{number:true}},notes:{select:{text:true}}},orderBy:[{occurredAt:"desc"},{id:"desc"}],skip:(page-1)*SEARCH_BLOCK_SIZE,take:SEARCH_BLOCK_SIZE});
 return rows.map(r=>({fundId:r.fundId!,direction:r.direction,amount:r.amount.toString(),at:r.occurredAt.toISOString(),narrative:r.hiddenNarrative?"Nội dung được ẩn theo nguồn sao kê":maskPhones(r.narrative),name:maskPhones(r.displayName),account:r.account.number,notes:r.notes.map(n=>({text:maskPhones(n.text)}))}));
},["public-directory-transactions-v2"],options);
export async function publicDirectory(search="",requestedPage=1){
 const funds=await directoryFunds(),query=search.trim().slice(0,100);
 type Preview=Omit<Awaited<ReturnType<typeof directoryTransactionBlock>>[number],"fundId">;
 const matched=new Map<string,{count:number;rows:Preview[]}>();
 if(query){
  const pages=Math.ceil(funds.reduce((n,f)=>n+f.count,0)/SEARCH_BLOCK_SIZE),active=new Set(funds.map(f=>f.id));
  for(let first=1;first<=pages;first+=3){
   const batches=await Promise.all(Array.from({length:Math.min(3,pages-first+1)},(_,i)=>directoryTransactionBlock(first+i)));
   for(const rows of batches)for(const row of rows)if(active.has(row.fundId)&&matchesPublicTransaction(row,query)){
    const group=matched.get(row.fundId)??{count:0,rows:[]};group.count++;
    if(group.rows.length<3){const {fundId,...publicRow}=row;void fundId;group.rows.push(publicRow)}
    matched.set(row.fundId,group);
   }
  }
 }
 const terms=normalize(query).split(" ").filter(Boolean);
 const results=funds.filter(f=>!query||matched.has(f.id)||terms.every(t=>normalize(`${f.code} ${f.name}`).includes(t)));
 const page=Math.min(Math.max(1,Math.floor(requestedPage)||1),Math.max(1,Math.ceil(results.length/DIRECTORY_PAGE_SIZE)));
 return {search:query,page,pageSize:DIRECTORY_PAGE_SIZE,count:results.length,activeCount:funds.length,transactionCount:[...matched.values()].reduce((n,g)=>n+g.count,0),funds:results.slice((page-1)*DIRECTORY_PAGE_SIZE,page*DIRECTORY_PAGE_SIZE).map(f=>{const {id,...publicFund}=f;return {...publicFund,matches:matched.get(id)?.count??0,previews:matched.get(id)?.rows??[]}})};
}
export type PublicDirectoryDTO=Awaited<ReturnType<typeof publicDirectory>>;
