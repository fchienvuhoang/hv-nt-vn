import "server-only";
import {fundMembership,fundShare} from "./allocation";
import {PUBLIC_DIRECTORY_TAG,publicFundTag} from "./cache-tags";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { fundTotals } from "./ledger";
import { maskPhones,normalize } from "./domain";
import { matchesPublicTransaction } from "./public-search";
export const PUBLIC_PAGE_SIZE = 100;
export const PUBLIC_TAG = "public-ledger";
// Keep public ledger data until a committed mutation invalidates its tag.
const options = { revalidate: false as const, tags: [PUBLIC_TAG] };
const publicIdentity=unstable_cache(async(slug:string)=>db.fund.findUnique({where:{slug},select:{id:true,code:true,name:true}}),["public-fund-identity-v3"],options);
async function publicFundSummary(slug:string,direction:"CREDIT"|"DEBIT",month:string){
 const identity=await publicIdentity(slug);if(!identity)return null;
 return unstable_cache(async()=>{
    const fund = await db.fund.findUnique({
      where: { slug },
      include: { account: true },
    });
    if (!fund) return null;
    const bankAccounts = await db.bankAccount.findMany({where:{id:{in:[fund.accountId,...fund.accountIds]}},select:{id:true,number:true}});
    const period=fund.isLongTerm?month:"";
    const start=period?new Date(`${period}-01T00:00:00+07:00`):undefined;
    const end=start?new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),1)-7*3600000):undefined;
    const where = { ...fundMembership(fund.id), direction, entryStatus: {in:period?["POSTED"]:["POSTED","OPENING"]},...(start?{occurredAt:{gte:start,lt:end}}:{}) };
    const [summary, previous, count, transfers, sync] = await Promise.all([
      fundTotals(db,fund.id,end),
      start?fundTotals(db,fund.id,start):Promise.resolve([]),
      db.bankTransaction.count({ where }),
      db.transfer.findMany({
        where: { ...(start?{createdAt:{gte:start,lt:end}}:{}),OR: [{ fromFundId: fund.id }, { toFundId: fund.id }] },
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
    const prior=previous[0];
    return {
      isLongTerm:fund.isLongTerm,month:period,carryBalance:prior?.balance.toString()??"0",
      code: fund.code,
      goalAmount: fund.goalAmount?.toString() ?? null,
      goalIncome: total.income.toString(),
      name: maskPhones(fund.name),
      slug,
      description: maskPhones(fund.description),
      status: fund.status,
      account: bankAccounts.map(a=>a.number).join(" · "),
      pendingImports: await db.fundImport.count({
        where: { fundId: fund.id, status: "RUNNING" },
      }),
      income: (total.income-(prior?.income??0n)).toString(),
      expense: (total.expense-(prior?.expense??0n)).toString(),
      balance: total.balance.toString(),
      availableBalance:total.availableBalance.toString(),
      excessExpense:total.excessExpense.toString(),
      openingBalance:total.openingBalance.toString(),
      openingBalances:total.byAccount.filter(a=>a.openingBalance!==0n).map(a=>({account:bankAccounts.find(b=>b.id===a.accountId)?.number??"",amount:a.openingBalance.toString(),at:a.openingAt?.toISOString()??null})),
      transferIn: (total.transferIn-(prior?.transferIn??0n)).toString(),
      transferOut: (total.transferOut-(prior?.transferOut??0n)).toString(),
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
  ["public-fund-summary-v15",slug,direction,month],
  {...options,tags:[PUBLIC_TAG,publicFundTag(identity.id)]},
 )();
}

// Cache public, masked rows by stable page, never by a visitor's search term.
const publicTransactionPage = async (fundId: string, direction: "CREDIT" | "DEBIT", page: number,month="") => unstable_cache(async()=>{
  const rows = await db.bankTransaction.findMany({
    where:{...fundMembership(fundId),direction,entryStatus:{in:month?["POSTED"]:["POSTED","OPENING"]},...(month?{occurredAt:{gte:new Date(`${month}-01T00:00:00+07:00`),lt:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)-7*3600000)}}:{})},
    select:{id:true,entryStatus:true,fundId:true,allocations:{select:{fundId:true,amount:true}},amount:true,occurredAt:true,narrative:true,hiddenNarrative:true,displayName:true,account:{select:{number:true}},notes:{select:{id:true,text:true,createdAt:true,kind:true},orderBy:[{createdAt:"asc"},{id:"asc"}]}},
    orderBy:[{occurredAt:"desc"},{id:"desc"}],skip:(page-1)*PUBLIC_PAGE_SIZE,take:PUBLIC_PAGE_SIZE,
  });
  return rows.map(r=>({id:r.id,dateUnknown:r.notes.some(n=>n.kind==="SOURCE_DATE_MISSING"),opening:r.entryStatus==="OPENING",account:r.account.number,amount:fundShare(r,fundId).toString(),at:r.occurredAt.toISOString(),
    notes:r.notes.map(n=>({id:n.id,text:maskPhones(n.text),at:n.createdAt.toISOString()})),narrative:r.hiddenNarrative?"Nội dung được ẩn theo nguồn sao kê":maskPhones(r.narrative),name:maskPhones(r.displayName)}));
},["public-transaction-page-v6",fundId,direction,String(page),month],{...options,tags:[PUBLIC_TAG,publicFundTag(fundId)]})();

export async function publicFund(slug: string, page: number, direction: "CREDIT" | "DEBIT", search = "", month = "") {
  const current=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit"}).format(new Date());
  // Public long-term funds only expose the current Vietnam month, regardless of URL input.
  void month;
  const selected=current;
  const fund=await publicFundSummary(slug,direction,selected);
  if(!fund)return null;
  const query=search.trim().slice(0,100);
  const requestedPage=Math.max(1,Math.floor(page)||1);
  if(!query){
    const currentPage=Math.min(requestedPage,Math.max(1,Math.ceil(fund.count/PUBLIC_PAGE_SIZE)));
    return {...fund,page:currentPage,rows:await publicTransactionPage(fund.id,direction,currentPage,fund.month)};
  }
  const matches: Awaited<ReturnType<typeof publicTransactionPage>>=[];
  const pages=Math.ceil(fund.count/PUBLIC_PAGE_SIZE);
  // Bound parallel cache misses to protect the connection pool on a cold cache.
  for(let first=1;first<=pages;first+=3){
    const batches=await Promise.all(Array.from({length:Math.min(3,pages-first+1)},(_,i)=>publicTransactionPage(fund.id,direction,first+i,fund.month)));
    for(const rows of batches)matches.push(...rows.filter(row=>matchesPublicTransaction(row,query)));
  }
  const currentPage=Math.min(requestedPage,Math.max(1,Math.ceil(matches.length/PUBLIC_PAGE_SIZE)));
  return {...fund,page:currentPage,count:matches.length,rows:matches.slice((currentPage-1)*PUBLIC_PAGE_SIZE,currentPage*PUBLIC_PAGE_SIZE)};
}

export type PublicFundDTO=Omit<NonNullable<Awaited<ReturnType<typeof publicFund>>>,"id"|"cutover">;
export async function publicFundTitle(slug:string){
  const identity=await publicIdentity(slug);
  const fund=identity?{...identity,name:maskPhones(identity.name)}:null;
  if(!fund)return null;
  const name=fund.name.trim();
  const hasCode=new RegExp(`^${fund.code}(?=$|[\\s:–—-])`,"i").test(name);
  return `${hasCode?name:`${fund.code} ${name}`} - Học viện nguyên thủy Việt Nam`;
}
export function publicFundDTO(fund:NonNullable<Awaited<ReturnType<typeof publicFund>>>):PublicFundDTO {
  const {id,cutover,...result}=fund;void id;void cutover;return result;
}

const DIRECTORY_PAGE_SIZE=12;
const directoryFunds=unstable_cache(async()=>{
  const totals=await fundTotals();
  return totals.filter(f=>f.status==="ACTIVE"&&f.publicListed).map(f=>({id:f.id,slug:f.slug,code:f.code,goalAmount:f.goalAmount?.toString()??null,name:maskPhones(f.name),description:maskPhones(f.description),income:f.income.toString(),expense:f.expense.toString(),balance:f.balance.toString(),availableBalance:f.availableBalance.toString(),excessExpense:f.excessExpense.toString(),openingBalance:f.openingBalance.toString(),count:f.statementCount,incomeCount:f.statementIncomeCount,expenseCount:f.statementExpenseCount}));
},["public-directory-funds-v9"],{...options,tags:[PUBLIC_TAG,PUBLIC_DIRECTORY_TAG]});
export async function publicDirectory(search="",requestedPage=1){
 const funds=await directoryFunds(),query=search.trim().slice(0,100);
 type Preview=Omit<Awaited<ReturnType<typeof publicTransactionPage>>[number],"id">&{direction:"CREDIT"|"DEBIT"};
 const matched=new Map<string,{count:number;rows:Preview[]}>();
 if(query){
  const batch:(()=>Promise<void>)[]=[];
  const flush=async()=>{await Promise.all(batch.map(load=>load()));batch.length=0};
  for(const fund of funds)for(const direction of ["CREDIT","DEBIT"] as const){
   const pages=Math.ceil((direction==="CREDIT"?fund.incomeCount:fund.expenseCount)/PUBLIC_PAGE_SIZE);
   for(let page=1;page<=pages;page++){
    const currentPage=page;
    batch.push(async()=>{
     const rows=await publicTransactionPage(fund.id,direction,currentPage);
     for(const row of rows)if(matchesPublicTransaction(row,query)){
      const group=matched.get(fund.id)??{count:0,rows:[]};group.count++;
      const {id,...publicRow}=row;void id;
      group.rows.push({...publicRow,direction});group.rows.sort((a,b)=>b.at.localeCompare(a.at));group.rows=group.rows.slice(0,3);
      matched.set(fund.id,group);
     }
    });
    if(batch.length===3)await flush();
   }
  }
  if(batch.length)await flush();
 }
 const terms=normalize(query).split(" ").filter(Boolean);
 const results=funds.filter(f=>!query||matched.has(f.id)||terms.every(t=>normalize(`${f.code} ${f.name}`).includes(t)));
 const page=Math.min(Math.max(1,Math.floor(requestedPage)||1),Math.max(1,Math.ceil(results.length/DIRECTORY_PAGE_SIZE)));
 return {search:query,page,pageSize:DIRECTORY_PAGE_SIZE,count:results.length,activeCount:funds.length,transactionCount:[...matched.values()].reduce((n,g)=>n+g.count,0),funds:results.slice((page-1)*DIRECTORY_PAGE_SIZE,page*DIRECTORY_PAGE_SIZE).map(f=>{const {id,incomeCount,expenseCount,...publicFund}=f;void incomeCount;void expenseCount;return {...publicFund,matches:matched.get(id)?.count??0,previews:matched.get(id)?.rows??[]}})};
}
export type PublicDirectoryDTO=Awaited<ReturnType<typeof publicDirectory>>;
