import assert from "node:assert/strict";
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(!["localhost","127.0.0.1"].includes(url.hostname)||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Require isolated localhost hvntvn_test database");
const {db}=await import("../src/lib/db");
const {startTabReclassification,advanceTabReclassification}=await import("../src/lib/reclassify");
const {localDate,startOfVietnamDay}=await import("../src/lib/domain");
if(await db.bankAccount.count())throw new Error("Require empty test database after test:integration");
const actor={id:"admin-test",name:"TEST admin",email:"admin@example.test"};
async function check(id:string){let r=await advanceTabReclassification(id,"CHECK",actor);while(r.status==="CHECKING")r=await advanceTabReclassification(id,"CHECK",actor);return r;}
async function apply(id:string){let r=await advanceTabReclassification(id,"APPLY",actor);while(r.status==="APPLYING")r=await advanceTabReclassification(id,"APPLY",actor);return r;}
try {
 const a=await db.bankAccount.create({data:{number:"0572",owner:"TEST",label:"TEST"}}),b=await db.bankAccount.create({data:{number:"0856",owner:"TEST",label:"TEST"}});
 const f=await db.fund.create({data:{accountId:a.id,accountIds:[b.id],code:"TPALPHA",name:"TEST",slug:"test-alpha",keywords:[]}});
 const beta=await db.fund.create({data:{accountId:a.id,accountIds:[b.id],code:"TPBETA",name:"TEST",slug:"test-beta",keywords:[]}});
 const today=localDate(),from=startOfVietnamDay(today);
 const base={accountId:a.id,amount:1000n,direction:"CREDIT" as const,refId:"TEST",displayName:"TEST",occurredAt:new Date(from.getTime()+3600000),sourceHash:"TEST",source:{test:true},narrative:"t p b e t a",fundId:f.id,assignment:"AUTO" as const};
 const make=(sourceId:string,extra:object={})=>db.bankTransaction.create({data:{...base,sourceId,...extra}});
 const many=await Promise.all(Array.from({length:101},(_,i)=>make(`many-${i}`)));
 const manual=await make("manual",{assignment:"MANUAL"}),ownCorrect=await make("correct",{narrative:"TPALPHA"}),unknown=await make("unknown",{narrative:"NO MATCH"}),manualLater=await make("manual-later"),review=await make("review",{entryStatus:"REVIEW"}),older=await make("older",{occurredAt:new Date(from.getTime()-1)}),other=await make("other-account",{accountId:b.id}),otherFund=await make("other-fund",{fundId:beta.id,narrative:"TPALPHA"}),pending=await make("pending",{fundId:null,assignment:"UNASSIGNED",narrative:"TPALPHA"});
 const excelManual=await make("excel-manual",{origin:"EXCEL",assignment:"MANUAL"});
 const scope={tab:"FUND" as const,fundId:f.id,from:today,to:today,account:a.id,type:"CREDIT" as const};
 const run=await startTabReclassification(scope,actor);
 assert.equal(run.total,104);assert.equal(run.manualProtected,2);assert.equal(run.reviewProtected,1);
 const late=await make("arrived-after-start");
 const preview=await check(run.id);assert.equal(preview.status,"READY");assert.equal(preview.checked,104);assert.equal(preview.changes,103);assert.equal(preview.unchanged,1);
 assert.equal(preview.changeDetails.length,103,"preview must include every proposed change, not a sample");
 assert.equal(new Set(preview.changeDetails.map(row=>row.id)).size,103);
 for(const sample of preview.changeDetails){
  const original=await db.bankTransaction.findUniqueOrThrow({where:{id:sample.id}});
  assert.equal(sample.transaction?.narrative,original.narrative);
  assert.equal(sample.transaction?.amount,original.amount.toString());
  assert.equal(sample.transaction?.accountNumber,"0572");
  assert.equal(sample.transaction?.occurredAt,original.occurredAt.toISOString());
 }
 assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{id:many[0].id}})).fundId,f.id,"preview cannot change money allocations");
 await db.bankTransaction.update({where:{id:manualLater.id},data:{assignment:"MANUAL",updatedAt:new Date(Date.now()+10)}});
 const result=await apply(run.id);assert.equal(result.status,"COMPLETE");assert.equal(result.applied,102);assert.equal(result.conflicted,1);
 assert.equal(result.changeDetails.length,103);
 assert.equal(result.changeDetails.filter(row=>row.status==="APPLIED").length,102);
 assert.equal(result.changeDetails.filter(row=>row.status==="CONFLICT").length,1);
 for(const row of many)assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{id:row.id}})).fundId,beta.id);
 for(const row of [manual,excelManual,manualLater,ownCorrect,older,other,review,late])assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{id:row.id}})).fundId,f.id);
 assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{id:unknown.id}})).fundId,null);
 assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{id:otherFund.id}})).fundId,beta.id);
 assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{id:pending.id}})).fundId,null);
 assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{id:many[0].id}})).updatedById,actor.id);
 const repeated=await apply(run.id);assert.equal(repeated.applied,102);assert.equal(await db.auditLog.count({where:{action:"TRANSACTION_RECLASSIFIED"}}),102);
 await assert.rejects(advanceTabReclassification(run.id,"CHECK",{...actor,email:"other@example.test"}));
 const pendingRun=await startTabReclassification({tab:"PENDING",from:today,to:today,account:a.id},actor);
 assert.equal((await check(pendingRun.id)).status,"READY");
 await db.fund.update({where:{id:f.id},data:{keywords:["CHANGED"]}});
 assert.equal((await apply(pendingRun.id)).status,"STALE");assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{id:pending.id}})).fundId,null);
 await db.fund.update({where:{id:f.id},data:{status:"PAUSED"}});
 const historical=await make("historical-paused",{refId:"PAUSED-ONLY",narrative:"TPALPHA"});
 const historyRun=await startTabReclassification({...scope,q:"PAUSED-ONLY"},actor);
 const historyCheck=await check(historyRun.id);assert.equal(historyCheck.changes,0);assert.equal(historyCheck.inactive,1);assert.equal(historyCheck.status,"COMPLETE");assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{id:historical.id}})).fundId,f.id);
 const race=await Promise.all(Array.from({length:150},(_,i)=>make(`race-${i}`,{refId:"RACE-ONLY"})));
 const raceRun=await startTabReclassification({...scope,q:"RACE-ONLY"},actor);
 await Promise.all([advanceTabReclassification(raceRun.id,"CHECK",actor),advanceTabReclassification(raceRun.id,"CHECK",actor)]);
 const racePreview=await check(raceRun.id);assert.equal(racePreview.checked,150);assert.equal(racePreview.changes,150);
 await Promise.all([advanceTabReclassification(raceRun.id,"APPLY",actor),advanceTabReclassification(raceRun.id,"APPLY",actor)]);
 const raceDone=await apply(raceRun.id);assert.equal(raceDone.applied,150);assert.equal(await db.bankTransaction.count({where:{id:{in:race.map(r=>r.id)},fundId:beta.id}}),150);
 await assert.rejects(startTabReclassification({...scope,tab:"ALL" as "FUND"},actor));
 console.log("PASS: whole-tab snapshot >100 rows, preview before writes, multi-batch moves and unassignment, manual protection before/during run, scope isolation, stable membership, idempotency, actor audit and stale-rule protection");
} finally {
 await db.tabReclassification.deleteMany();await db.auditLog.deleteMany();await db.bankTransaction.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();await db.$disconnect();
}
