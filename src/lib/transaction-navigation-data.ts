import "server-only";
import {ADMIN_LEDGER_TAG} from "./cache-tags";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { transactionDates } from "./transaction-scope";
import { syncAccountStatus } from "./sync-status";
import { PUBLIC_TAG } from "./public-data";
import type { Prisma } from "@/generated/prisma/client";
export type TransactionFilter = {from:string;to:string;account:string;q:string;type:string;review:string};
export function transactionWhere(filter:TransactionFilter):Prisma.BankTransactionWhereInput {
  const range=transactionDates(filter.from,filter.to);
  return {...(!range.allTime?{occurredAt:{gte:range.start,lt:range.end}}:{}),entryStatus:filter.review==="1"?"REVIEW":filter.review==="merged"?"MERGED":{not:"MERGED"},
    ...(filter.account?{accountId:filter.account}:{}),
    ...(filter.type==="CREDIT"||filter.type==="DEBIT"?{direction:filter.type}:{}),
    ...(filter.q?{OR:[{narrative:{contains:filter.q,mode:"insensitive"}},{refId:{contains:filter.q,mode:"insensitive"}}]}:{})};
}
const cachedNavigation=unstable_cache(async()=>{
  const scope:Prisma.BankTransactionWhereInput={entryStatus:{not:"MERGED"}},historyScope=scope;
  const [baseGroups,baseHistory,allocated,allocatedHistory,total,accounts,funds]=await Promise.all([
    db.bankTransaction.groupBy({by:["fundId"],where:{AND:[scope,{allocations:{none:{}}}]},_count:true}),
    db.bankTransaction.groupBy({by:["fundId"],where:{AND:[historyScope,{fundId:{not:null},allocations:{none:{}}}]},_count:true,_min:{occurredAt:true},_max:{occurredAt:true}}),
    db.fundAllocation.findMany({where:{transaction:scope},select:{fundId:true,transaction:{select:{occurredAt:true}}}}),
    db.fundAllocation.findMany({where:{transaction:historyScope},select:{fundId:true,transaction:{select:{occurredAt:true}}}}),
    db.bankTransaction.count({where:scope}),syncAccountStatus(),
    db.fund.findMany({select:{id:true,code:true,name:true,status:true,accountId:true,accountIds:true},orderBy:{code:"asc"}}),
  ]);
  const counts=new Map(baseGroups.map(g=>[g.fundId,g._count]));
  for(const a of allocated)counts.set(a.fundId,(counts.get(a.fundId)??0)+1);
  const history=new Map(baseHistory.map(h=>[h.fundId!,{fundId:h.fundId,count:h._count,from:h._min.occurredAt?.toISOString()??null,to:h._max.occurredAt?.toISOString()??null}]));
  for(const a of allocatedHistory){const at=a.transaction.occurredAt.toISOString(),old=history.get(a.fundId);history.set(a.fundId,{fundId:a.fundId,count:(old?.count??0)+1,from:old?.from&&old.from<at?old.from:at,to:old?.to&&old.to>at?old.to:at})}
  return {groups:[...counts].map(([fundId,_count])=>({fundId,_count})),accounts,funds,total,history:[...history.values()]};
},["transaction-navigation-global-v5"],{revalidate:20,tags:[PUBLIC_TAG,ADMIN_LEDGER_TAG]});
// Share navigation metadata within a request and across REST reads for 20 seconds.
export const transactionNavigationData=cache(cachedNavigation);

