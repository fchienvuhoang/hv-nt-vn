import "server-only";
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
  return {occurredAt:{gte:range.start,lt:range.end},entryStatus:filter.review==="1"?"REVIEW":filter.review==="merged"?"MERGED":{not:"MERGED"},
    ...(filter.account?{accountId:filter.account}:{}),
    ...(filter.type==="CREDIT"||filter.type==="DEBIT"?{direction:filter.type}:{}),
    ...(filter.q?{OR:[{narrative:{contains:filter.q,mode:"insensitive"}},{refId:{contains:filter.q,mode:"insensitive"}}]}:{})};
}
const cachedNavigation=unstable_cache(async (key:string)=>{
  const filter=JSON.parse(key) as TransactionFilter;
  const scope=transactionWhere(filter),historyScope={...scope};delete historyScope.occurredAt;
  const [groups,history,accounts,funds]=await Promise.all([
    db.bankTransaction.groupBy({by:["fundId"],where:scope,_count:true}),
    db.bankTransaction.groupBy({by:["fundId"],where:{...historyScope,fundId:{not:null}},_count:true,_min:{occurredAt:true},_max:{occurredAt:true}}),
    syncAccountStatus(),
    db.fund.findMany({select:{id:true,code:true,name:true,status:true,accountId:true,accountIds:true},orderBy:{code:"asc"}}),
  ]);
  return {groups,accounts,funds,history:history.map(h=>({fundId:h.fundId,count:h._count,from:h._min.occurredAt?.toISOString()??null,to:h._max.occurredAt?.toISOString()??null}))};
},["transaction-navigation-v1"],{revalidate:20,tags:[PUBLIC_TAG]});
// Share navigation metadata within a request and across REST reads for 20 seconds.
export const transactionNavigationData=cache(cachedNavigation);

