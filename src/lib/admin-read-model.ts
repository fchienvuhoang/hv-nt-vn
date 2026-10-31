import "server-only";
import { TRANSACTION_SUMMARY_TAG } from "./transaction-summary";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { fundTotals, accountTotals } from "./ledger";
import { syncAccountStatus } from "./sync-status";
import { PUBLIC_TAG } from "./public-data";
import { encodeAdmin, decodeAdmin } from "./admin-codec";
import { transactionWhere, transactionNavigationData } from "./transaction-navigation-data";
import { transactionDates } from "./transaction-scope";
import { localDate, startOfVietnamDay } from "./domain";
import type { AdminParams } from "./admin-navigation";
async function bootstrap(){
  const funds=await fundTotals();
  const [balances,states,recency]=await Promise.all([accountTotals(funds),db.syncState.findMany({include:{account:true},orderBy:[{accountId:"asc"},{direction:"asc"}]}),syncAccountStatus()]);
  return {funds,balances,accounts:balances.map(a=>({id:a.id,number:a.number,label:a.label,syncFrom:a.syncFrom})),states,recency};
}
export type AdminBootstrap=Awaited<ReturnType<typeof bootstrap>>;
const cachedBootstrap=unstable_cache(async()=>encodeAdmin(await bootstrap()),["admin-bootstrap-rest-v1"],{revalidate:20,tags:[PUBLIC_TAG,TRANSACTION_SUMMARY_TAG]});
export async function loadAdminBootstrap(){return decodeAdmin<AdminBootstrap>(await cachedBootstrap())}
export async function loadAdminTransactions(params:AdminParams){
  const range=transactionDates(params.from,params.to),page=Math.min(100000,Math.max(1,Math.floor(Number(params.page)||1))),pageSize=100;
  const filter={from:range.from,to:range.to,account:params.account??"",q:(params.q??"").slice(0,100),type:params.type??"",review:params.review??""};
  const scope=transactionWhere(filter),where={...scope,...(params.pending==="1"?{fundId:null}:params.fund?{fundId:params.fund}:{})};
  const [rows,navigation]=await Promise.all([db.bankTransaction.findMany({where,omit:{source:true,sourceHash:true},include:{fund:true,account:true,notes:{orderBy:[{createdAt:"asc"},{id:"asc"}]}},orderBy:[{occurredAt:"desc"},{id:"desc"}],skip:(page-1)*pageSize,take:pageSize}),transactionNavigationData(JSON.stringify(filter))]);
  const total=navigation.groups.reduce((n,g)=>n+g._count,0),pending=navigation.groups.find(g=>g.fundId===null)?._count??0;
  const count=params.pending==="1"?pending:params.fund?navigation.groups.find(g=>g.fundId===params.fund)?._count??0:total;
  return {rows,...navigation,page,pageSize,count,total,pending,range:{from:range.from,to:range.to,error:range.error},filter};
}
export type AdminTransactions=Awaited<ReturnType<typeof loadAdminTransactions>>;
export async function loadAdminTransfers(){return db.transfer.findMany({include:{fromFund:{include:{account:true}},account:true,toFund:true,reversal:true},orderBy:{createdAt:"desc"},take:100})}
export type AdminTransfers=Awaited<ReturnType<typeof loadAdminTransfers>>;
async function scheduleStats(){
  const since=startOfVietnamDay(localDate()),kind={in:["FULL_DAY","PREVIOUS_DAY"]};
  const [requestsToday,requestsAll,quickToday,grouped,lastCall,sweepsToday,sweepsDone,sweepsAll,lastSweep]=await Promise.all([
    db.syncInvocation.count({where:{receivedAt:{gte:since}}}),db.syncInvocation.count(),db.syncInvocation.count({where:{receivedAt:{gte:since},quickPages:{gt:0}}}),db.syncInvocation.groupBy({by:["status"],where:{receivedAt:{gte:since}},_count:true}),db.syncInvocation.findFirst({orderBy:{receivedAt:"desc"},select:{receivedAt:true}}),db.syncJob.count({where:{kind,startedAt:{gte:since}}}),db.syncJob.count({where:{kind,finishedAt:{gte:since},status:"SUCCESS"}}),db.syncJob.count({where:{kind,startedAt:{not:null}}}),db.syncJob.findFirst({where:{kind,lastCalledAt:{not:null}},orderBy:{lastCalledAt:"desc"},select:{lastCalledAt:true}})]);
  return {requestsToday,requestsAll,quickToday,grouped,lastCall,sweepsToday,sweepsDone,sweepsAll,lastSweep};
}
const cachedStats=unstable_cache(async()=>encodeAdmin(await scheduleStats()),["admin-sync-stats-rest-v1"],{revalidate:5,tags:[PUBLIC_TAG]});
export async function loadAdminSync(log:string){
  const [runs,audits,requests,sweeps,stats]=await Promise.all([
    log==="runs"?db.syncRun.findMany({orderBy:{startedAt:"desc"},take:30}):Promise.resolve([]),
    log==="audit"?db.auditLog.findMany({orderBy:{createdAt:"desc"},take:100}):Promise.resolve([]),
    !["runs","audit","full"].includes(log)?db.syncInvocation.findMany({orderBy:{receivedAt:"desc"},take:100}):Promise.resolve([]),
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
