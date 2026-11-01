import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma, type TabReclassification } from "@/generated/prisma/client";
import { db } from "./db";
import { classify } from "./domain";
import { actorStamp, updatedStamp, type Actor } from "./actor";
import { serializable, type LedgerClient } from "./ledger";
import { transactionDates } from "./transaction-scope";
const scopeSchema = z.object({
  tab: z.enum(["PENDING","FUND"]), fundId: z.string().min(1).max(100).optional(),
  from: z.string(), to: z.string(), account: z.string().max(100).default(""),
  type: z.enum(["CREDIT","DEBIT",""]).default(""), q: z.string().max(100).default(""),
}).refine(s=>s.tab!=="FUND"||!!s.fundId,"Chọn tab thiện pháp trước khi phân loại");
export type ReclassificationScope = z.input<typeof scopeSchema>;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function reclassificationScope(input: ReclassificationScope) {
  const scope = scopeSchema.parse(input);
  if (scope.tab === "PENDING") delete scope.fundId;
  if (transactionDates(scope.from,scope.to).error) throw new Error("Khoảng ngày không hợp lệ");
  return { scope, key: hash(scope) };
}
async function rulesFor(client: LedgerClient) {
  return client.fund.findMany({select:{id:true,code:true,accountId:true,accountIds:true,keywords:true,status:true},orderBy:{id:"asc"}});
}
async function summary(client: LedgerClient, run: TabReclassification) {
  const changes = await client.tabReclassificationItem.findMany({where:{runId:run.id,OR:[{status:{in:["CHANGE","APPLIED"]}},{status:"CONFLICT",plannedAssignment:{not:null}}]},orderBy:{transactionId:"asc"}});
  const fundIds = [...new Set(changes.flatMap(i=>[i.beforeFundId,i.plannedFundId]).filter((id):id is string=>!!id))];
  const funds = await client.fund.findMany({where:{id:{in:fundIds}},select:{id:true,code:true,name:true}});
  const fundLabels = new Map(funds.map(f=>[f.id,`${f.code} · ${f.name}`]));
  const readTransactions = (ids: string[]) => client.bankTransaction.findMany({where:{id:{in:ids}},select:{id:true,narrative:true,displayName:true,occurredAt:true,amount:true,direction:true,refId:true,account:{select:{number:true}}}});
  const transactionById = new Map<string,Awaited<ReturnType<typeof readTransactions>>[number]>();
  for(let offset=0;offset<changes.length;offset+=1000){
    for(const transaction of await readTransactions(changes.slice(offset,offset+1000).map(i=>i.transactionId)))transactionById.set(transaction.id,transaction);
  }
  const label = (id: string|null) => id ? fundLabels.get(id) ?? "Thiện pháp cũ" : "Chưa phân loại";
  return {...run,scope:run.scope as unknown as z.output<typeof scopeSchema>,createdAt:run.createdAt.toISOString(),updatedAt:run.updatedAt.toISOString(),finishedAt:run.finishedAt?.toISOString()??null,
    changeDetails:changes.map(i=>{
      const transaction=transactionById.get(i.transactionId);
      return {id:i.transactionId,from:label(i.beforeFundId),to:label(i.plannedFundId),reason:i.reason,status:i.status,
        transaction:transaction?{narrative:transaction.narrative,displayName:transaction.displayName,occurredAt:transaction.occurredAt.toISOString(),amount:transaction.amount.toString(),direction:transaction.direction,refId:transaction.refId,accountNumber:transaction.account.number}:null};
    })};
}
export type ReclassificationSummary = Awaited<ReturnType<typeof summary>>;
export async function latestTabReclassification(input: ReclassificationScope, actor: Actor) {
  const {key}=reclassificationScope(input);
  const run=await db.tabReclassification.findFirst({where:{scopeKey:key,actor:actorStamp(actor).actor},orderBy:{createdAt:"desc"}});
  return run ? summary(db,run) : null;
}
export async function startTabReclassification(input: ReclassificationScope, actor: Actor) {
  const {scope,key}=reclassificationScope(input);
  const range=transactionDates(scope.from,scope.to);
  return serializable(async tx=>{
    if(scope.tab==="FUND") await tx.fund.findUniqueOrThrow({where:{id:scope.fundId}});
    const rules=await rulesFor(tx);
    const superseded = await tx.tabReclassification.updateMany({where:{scopeKey:key,actor:actorStamp(actor).actor,status:{in:["CHECKING","READY","APPLYING"]}},data:{status:"STALE",error:"Đã bắt đầu một lượt kiểm tra mới cho cùng tab và bộ lọc.",finishedAt:new Date()}});
    const run=await tx.tabReclassification.create({data:{scopeKey:key,scope,ruleHash:hash(rules),...actorStamp(actor)}});
    const conditions=Prisma.sql`"occurredAt" >= ${range.start} AND "occurredAt" < ${range.end}
      AND ${scope.tab==="FUND" ? Prisma.sql`(("fundId" = ${scope.fundId} AND NOT EXISTS(SELECT 1 FROM "FundAllocation" fa WHERE fa."transactionId"="BankTransaction".id)) OR EXISTS(SELECT 1 FROM "FundAllocation" fa WHERE fa."transactionId"="BankTransaction".id AND fa."fundId"=${scope.fundId}))` : Prisma.sql`"fundId" IS NULL`}
      ${scope.account?Prisma.sql`AND "accountId" = ${scope.account}`:Prisma.empty}
      ${scope.type?Prisma.sql`AND "direction"::text = ${scope.type}`:Prisma.empty}
      ${scope.q?Prisma.sql`AND (POSITION(LOWER(${scope.q}) IN LOWER(narrative)) > 0 OR POSITION(LOWER(${scope.q}) IN LOWER("refId")) > 0)`:Prisma.empty}`;
    const counts=await tx.$queryRaw<{manual:bigint;review:bigint}[]>(Prisma.sql`SELECT COUNT(*) FILTER (WHERE assignment::text = 'MANUAL') AS manual, COUNT(*) FILTER (WHERE "entryStatus" = 'REVIEW' AND assignment::text <> 'MANUAL') AS review FROM "BankTransaction" WHERE ${conditions} AND "entryStatus" IN ('POSTED','REVIEW')`);
    // Snapshot the full tab inside PostgreSQL, without loading its IDs into JS.
    const total=await tx.$executeRaw(Prisma.sql`INSERT INTO "TabReclassificationItem" ("runId","transactionId","beforeFundId","beforeAssignment","beforeUpdatedAt")
      SELECT ${run.id},id,"fundId",assignment::text,"updatedAt" FROM "BankTransaction"
      WHERE ${conditions} AND "entryStatus" = 'POSTED' AND assignment::text <> 'MANUAL'`);
    const saved=await tx.tabReclassification.update({where:{id:run.id},data:{total,manualProtected:Number(counts[0].manual),reviewProtected:Number(counts[0].review),...(total?{}:{status:"COMPLETE",finishedAt:new Date()})}});
    await tx.auditLog.create({data:{...actorStamp(actor),action:"TAB_RECLASSIFICATION_STARTED",entityId:run.id,details:{scope,total,superseded:superseded.count,manualProtected:saved.manualProtected,reviewProtected:saved.reviewProtected}}});
    return summary(tx,saved);
  });
}
export async function advanceTabReclassification(runId: string, phase: "CHECK"|"APPLY", actor: Actor) {
  z.string().min(1).max(100).parse(runId);
  return serializable(async tx=>{
    await tx.$queryRaw`SELECT id FROM "TabReclassification" WHERE id=${runId} FOR UPDATE`;
    let run=await tx.tabReclassification.findUniqueOrThrow({where:{id:runId}});
    if(run.actor!==actorStamp(actor).actor)throw new Error("Chỉ người khởi tạo được tiếp tục lượt kiểm tra này");
    if(["COMPLETE","STALE"].includes(run.status))return summary(tx,run);
    if(phase==="CHECK"&&run.status!=="CHECKING")return summary(tx,run);
    if(phase==="APPLY"&&!["READY","APPLYING"].includes(run.status))throw new Error("Cần kiểm tra xong trước khi áp dụng");
    const rules=await rulesFor(tx);
    if(hash(rules)!==run.ruleHash){
      run=await tx.tabReclassification.update({where:{id:runId},data:{status:"STALE",error:"Cấu hình thiện pháp đã thay đổi. Dừng lượt này và kiểm tra lại; các thay đổi đã áp dụng vẫn có lịch sử.",finishedAt:new Date()}});
      await tx.auditLog.create({data:{...actorStamp(actor),action:"TAB_RECLASSIFICATION_STALE",entityId:runId,details:{applied:run.applied}}});
      return summary(tx,run);
    }
    const items=await tx.tabReclassificationItem.findMany({where:{runId,status:phase==="CHECK"?"PENDING":"CHANGE"},orderBy:{transactionId:"asc"},take:100});
    const rows=await tx.bankTransaction.findMany({where:{id:{in:items.map(i=>i.transactionId)}},select:{id:true,accountId:true,narrative:true,fundId:true,assignment:true,entryStatus:true,updatedAt:true}});
    const found=new Map(rows.map(r=>[r.id,r]));
    const conflicts:string[]=[],keep:string[]=[];
    const plans:{id:string;fundId:string|null;assignment:"AUTO"|"UNASSIGNED";reason:string;beforeFundId:string|null;beforeAssignment:string}[]=[];
    let noMatch=0,inactive=0,ambiguous=0;
    for(const item of items){
      const row=found.get(item.transactionId);
      // Preserve MANUAL even if somebody assigns it during preview or applying.
      if(!row||row.assignment==="MANUAL"||row.entryStatus!=="POSTED"||row.updatedAt.getTime()!==item.beforeUpdatedAt.getTime()||row.fundId!==item.beforeFundId||row.assignment!==item.beforeAssignment){conflicts.push(item.transactionId);continue;}
      if(phase==="APPLY"){
        plans.push({id:row.id,fundId:item.plannedFundId,assignment:item.plannedAssignment as "AUTO"|"UNASSIGNED",reason:item.reason,beforeFundId:item.beforeFundId,beforeAssignment:item.beforeAssignment});continue;
      }
      const match=classify(row.narrative,row.accountId,rules);
      if(!match.fundId){
        if(match.reason.includes("nhiều thiện pháp"))ambiguous++;
        else if(match.reason.includes("tạm dừng hoặc hoàn thành"))inactive++;
        else noMatch++;
      }
      // Existing valid allocations to a paused/completed fund are historical;
      // don't remove them merely because it no longer accepts new automatic gifts.
      const preserveInactive="matchedInactiveFundId" in match && match.matchedInactiveFundId===row.fundId && !!row.fundId;
      const fundId=preserveInactive?row.fundId:match.fundId;
      const assignment=fundId?"AUTO":"UNASSIGNED";
      if(fundId===row.fundId&&assignment===row.assignment){keep.push(row.id);continue;}
      plans.push({id:row.id,fundId,assignment,reason:match.reason,beforeFundId:item.beforeFundId,beforeAssignment:item.beforeAssignment});
    }
    if(conflicts.length)await tx.tabReclassificationItem.updateMany({where:{runId,transactionId:{in:conflicts}},data:{status:"CONFLICT"}});
    if(keep.length)await tx.tabReclassificationItem.updateMany({where:{runId,transactionId:{in:keep}},data:{status:"KEEP"}});
    const groups=new Map<string,typeof plans>();
    for(const plan of plans){const key=JSON.stringify([plan.fundId,plan.assignment,plan.reason]);const group=groups.get(key)??[];group.push(plan);groups.set(key,group);}
    for(const group of groups.values()){
      const p=group[0],ids=group.map(p=>p.id);
      if(phase==="CHECK")await tx.tabReclassificationItem.updateMany({where:{runId,transactionId:{in:ids}},data:{status:"CHANGE",plannedFundId:p.fundId,plannedAssignment:p.assignment,reason:p.reason}});
      else {
        const changed=await tx.bankTransaction.updateMany({where:{id:{in:ids},entryStatus:"POSTED",assignment:{not:"MANUAL"}},data:{fundId:p.fundId,assignment:p.assignment,matchReason:p.reason,...updatedStamp(actor)}});
        if(changed.count!==ids.length)throw new Error("Giao dịch vừa thay đổi; thử tiếp tục để kiểm tra lại");
        await tx.tabReclassificationItem.updateMany({where:{runId,transactionId:{in:ids}},data:{status:"APPLIED"}});
      }
    }
    if(phase==="APPLY"&&plans.length)await tx.auditLog.createMany({data:plans.map(p=>({...actorStamp(actor),action:"TRANSACTION_RECLASSIFIED",entityId:p.id,details:{runId,previousFundId:p.beforeFundId,previousAssignment:p.beforeAssignment,fundId:p.fundId,assignment:p.assignment,reason:p.reason,scope:"TAB"}}))});
    const remaining=await tx.tabReclassificationItem.count({where:{runId,status:phase==="CHECK"?"PENDING":"CHANGE"}});
    const status=phase==="CHECK"?(remaining?"CHECKING":run.changes+plans.length?"READY":"COMPLETE"):(remaining?"APPLYING":"COMPLETE");
    run=await tx.tabReclassification.update({where:{id:runId},data:{status,conflicted:{increment:conflicts.length},...(phase==="CHECK"?{checked:{increment:items.length},changes:{increment:plans.length},unchanged:{increment:keep.length},noMatch:{increment:noMatch},inactive:{increment:inactive},ambiguous:{increment:ambiguous}}:{applied:{increment:plans.length}}),...(status==="COMPLETE"?{finishedAt:new Date()}:{})}});
    if(status==="READY"||status==="COMPLETE")await tx.auditLog.create({data:{...actorStamp(actor),action:status==="READY"?"TAB_RECLASSIFICATION_CHECKED":"TAB_RECLASSIFICATION_FINISHED",entityId:runId,details:{total:run.total,checked:run.checked,changes:run.changes,applied:run.applied,manualProtected:run.manualProtected,conflicted:run.conflicted}}});
    return summary(tx,run);
  });
}
