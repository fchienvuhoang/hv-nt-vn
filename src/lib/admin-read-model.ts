import {recentSyncEvents} from "./sync-events";
import "server-only";
import {fundMembership,fundShare} from "./allocation";
import {ADMIN_LEDGER_TAG} from "./cache-tags";
import { TRANSACTION_SUMMARY_TAG } from "./transaction-summary";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { fundTotals, accountTotals } from "./ledger";
import { formatSyncAccountStatus } from "./sync-status";
import { PUBLIC_TAG } from "./public-data";
import { encodeAdmin, decodeAdmin } from "./admin-codec";
import { transactionWhere, transactionNavigationData } from "./transaction-navigation-data";
import { transactionDates } from "./transaction-scope";
import { localDate, startOfVietnamDay } from "./domain";
import type { AdminParams } from "./admin-navigation";
async function bootstrap(){
  const funds=await fundTotals();
  const [balances,states]=await Promise.all([accountTotals(funds),db.syncState.findMany({include:{account:true},orderBy:[{accountId:"asc"},{direction:"asc"}]})]);
  const recency=formatSyncAccountStatus(balances.map(a=>({...a,syncStates:states.filter(s=>s.accountId===a.id)})));
  return {funds,balances,accounts:balances.map(a=>({id:a.id,number:a.number,label:a.label,syncFrom:a.syncFrom})),states,recency};
}
export type AdminBootstrap=Awaited<ReturnType<typeof bootstrap>>;
const cachedBootstrap=unstable_cache(async()=>encodeAdmin(await bootstrap()),["admin-bootstrap-rest-v9"],{revalidate:20,tags:[PUBLIC_TAG,ADMIN_LEDGER_TAG,TRANSACTION_SUMMARY_TAG]});
export async function loadAdminBootstrap(){return decodeAdmin<AdminBootstrap>(await cachedBootstrap())}
export async function loadAdminTransactions(params:AdminParams){
  const range=transactionDates(params.from,params.to),page=Math.min(100000,Math.max(1,Math.floor(Number(params.page)||1))),pageSize=100;
  const filter={from:range.from,to:range.to,account:params.account??"",q:(params.q??"").slice(0,100),type:params.type??"",review:params.review??"",assignment:params.assignment??"",posted:params.posted??""};
  const scope=transactionWhere(filter),where={AND:[scope,...(params.pending==="1"?[fundMembership(null)]:params.fund?[fundMembership(params.fund)]:[])]};
  const [rawRows,navigation]=await Promise.all([db.bankTransaction.findMany({where,omit:{source:true,sourceHash:true},include:{_count:{select:{allocationTransfers:true}},allocations:{include:{fund:true}},fund:true,account:true,notes:{orderBy:[{createdAt:"asc"},{id:"asc"}]}},orderBy:[{occurredAt:"desc"},{id:"desc"}],skip:(page-1)*pageSize,take:pageSize}),transactionNavigationData()]);
  const rows=rawRows.map(row=>({...row,originalAmount:row.amount,dateUnknown:row.notes.some(n=>n.kind==="SOURCE_DATE_MISSING"),amount:params.fund?fundShare(row,params.fund):row.amount,fund:params.fund&&row.allocations.length?row.allocations.find(a=>a.fundId===params.fund)?.fund??null:row.fund}));
  const total=navigation.total,pending=navigation.groups.find(g=>g.fundId===null)?._count??0;
  const selectedTotal=params.pending==="1"?pending:params.fund?navigation.groups.find(g=>g.fundId===params.fund)?._count??0:total;
  const filtered=!range.allTime||!!filter.account||!!filter.q||!!filter.type||!!filter.review||!!filter.assignment||filter.posted==="1";
  const count=filtered?await unstable_cache(async()=>db.bankTransaction.count({where}),["transaction-filtered-count-v1",JSON.stringify(where)],{revalidate:20,tags:[PUBLIC_TAG,ADMIN_LEDGER_TAG]})():selectedTotal;
  return {rows,...navigation,page,pageSize,count,total,pending,selectedTotal,range:{from:range.from,to:range.to,error:range.error,allTime:range.allTime},filter};
}
export type AdminTransactions=Awaited<ReturnType<typeof loadAdminTransactions>>;
export async function loadAdminTransfers(){return db.transfer.findMany({include:{fromFund:{include:{account:true}},account:true,toFund:true,reversal:true,_count:{select:{items:true,balanceItems:true}}},orderBy:{createdAt:"desc"},take:100})}
export type AdminTransfers=Awaited<ReturnType<typeof loadAdminTransfers>>;
async function scheduleStats(){
  const since=startOfVietnamDay(localDate());
  const events=await recentSyncEvents(),todayEvents=events.filter(e=>e.receivedAt>=since);
  const requestsToday=todayEvents.length,requestsAll=events.length,quickToday=todayEvents.filter(e=>e.quickPages>0).length,lastCall=events[0]?{receivedAt:events[0].receivedAt}:null;
  const grouped=[...new Set(todayEvents.map(e=>e.status))].map(status=>({status,_count:todayEvents.filter(e=>e.status===status).length}));
  const [counts]=await db.$queryRaw<{today:number;done:number;all:number;last:Date|null}[]>`SELECT
   count(*) FILTER (WHERE "startedAt">=${since})::int AS today,
   count(*) FILTER (WHERE "finishedAt">=${since} AND status='SUCCESS')::int AS done,
   count(*) FILTER (WHERE "startedAt" IS NOT NULL)::int AS all,
   max("lastCalledAt") AS last FROM "SyncJob" WHERE kind IN ('FULL_DAY','PREVIOUS_DAY')`;
  const sweepsToday=counts.today,sweepsDone=counts.done,sweepsAll=counts.all,lastSweep=counts.last?{lastCalledAt:counts.last}:null;
  return {requestsToday,requestsAll,quickToday,grouped,lastCall,sweepsToday,sweepsDone,sweepsAll,lastSweep};
}
const cachedStats=unstable_cache(async()=>encodeAdmin(await scheduleStats()),["admin-sync-stats-rest-v2"],{revalidate:5,tags:[PUBLIC_TAG,ADMIN_LEDGER_TAG]});
export async function loadAdminSync(log:string){
  const [runs,audits,requests,sweeps,stats]=await Promise.all([
    log==="runs"?db.syncRun.findMany({orderBy:{startedAt:"desc"},take:30}):Promise.resolve([]),
    log==="audit"?db.auditLog.findMany({orderBy:{createdAt:"desc"},take:100}):Promise.resolve([]),
    !["runs","audit","full"].includes(log)?recentSyncEvents():Promise.resolve([]),
    log==="full"?db.syncJob.findMany({where:{kind:{in:["FULL_DAY","PREVIOUS_DAY"]}},orderBy:{scheduledAt:"desc"},take:100}):Promise.resolve([]),
    ["runs","audit"].includes(log)?Promise.resolve(null):cachedStats().then(v=>decodeAdmin<Awaited<ReturnType<typeof scheduleStats>>>(v)),
  ]);
  return {runs,audits,requests,sweeps,stats};
}
export type AdminSync=Awaited<ReturnType<typeof loadAdminSync>>;
export async function loadReviewCandidates(id:string){
  const entry=await db.bankTransaction.findUniqueOrThrow({where:{id}}),start=startOfVietnamDay(localDate(entry.occurredAt));
  return db.bankTransaction.findMany({where:{accountId:entry.accountId,entryStatus:"POSTED",direction:entry.direction,amount:entry.amount,occurredAt:{gte:start,lt:new Date(start.getTime()+86400000)}},select:{id:true,occurredAt:true,origin:true,narrative:true,fund:{select:{code:true}}},orderBy:{occurredAt:"desc"},take:100});
}
export type ReviewCandidates=Awaited<ReturnType<typeof loadReviewCandidates>>;

export async function loadTransferDetails(id:string){return db.transfer.findUniqueOrThrow({where:{id},include:{fromFund:{select:{code:true,name:true}},toFund:{select:{code:true,name:true}},items:{orderBy:{id:"asc"}},balanceItems:{orderBy:{id:"asc"}}}})}
export type TransferDetails=Awaited<ReturnType<typeof loadTransferDetails>>;
