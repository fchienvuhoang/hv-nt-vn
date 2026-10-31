import assert from "node:assert/strict";
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(!["localhost","127.0.0.1"].includes(url.hostname)||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Require isolated localhost hvntvn_test database");
const {db}=await import("../src/lib/db");
const {scheduledSync}=await import("../src/lib/scheduled-sync");
const {localDate,startOfVietnamDay}=await import("../src/lib/domain");
const originalFetch=globalThis.fetch;
async function clean(){
 await db.tabReclassification.deleteMany();
 await db.syncJob.deleteMany();await db.syncInvocation.deleteMany();await db.auditLog.deleteMany();await db.syncLease.deleteMany();await db.syncRun.deleteMany();await db.transfer.deleteMany({where:{reversalOf:{not:null}}});await db.transfer.deleteMany();await db.bankTransaction.deleteMany();await db.syncState.deleteMany();await db.fundImport.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();
}
try{
 await clean();
 const day=localDate();const now=new Date(`${day}T10:01:00+07:00`);
 const yesterday=localDate(new Date(startOfVietnamDay(day).getTime()-86400000));
 await db.bankAccount.create({data:{number:"0572",owner:"TEST",label:"TEST",syncFrom:startOfVietnamDay(yesterday)}});
 await db.bankAccount.create({data:{number:"0856",owner:"TEST",label:"TEST",syncFrom:startOfVietnamDay(yesterday)}});
 const calls:{size:number;day:string;page:number}[]=[];
 let failure=false;
 globalThis.fetch=async input=>{
  const u=new URL(String(input));
  if(u.pathname.endsWith("/transactionsV2")){
   const number=u.pathname.split("/").at(-2)!,username=number==="0572"?"hvnguyenthuyvnhotritambao":"hvnguyenthuyvnphungsucongdong",userId=number==="0572"?"2020856147493257216":"2011680198621147136";
   return Response.json({status:200,data:{accountNumber:number,username,userId,totalCredit:1000,totalDebit:200}});
  }
  const size=Number(u.searchParams.get("pageSize")),page=Number(u.searchParams.get("page")),d=u.searchParams.get("fromDate")!;
  calls.push({size,day:d,page});if(failure)throw new Error("test upstream outage");
  const a=u.searchParams.get("accountNo"),direction=u.searchParams.get("type");
  if(a!=="0572"||direction!=="CREDIT")return Response.json({status:200,data:{total:0,page,items:[]}});
  const total=125;const start=(page-1)*size;
  const items=Array.from({length:Math.max(0,Math.min(size+1,total-start))},(_,i)=>({id:`${d}-${start+i}`,bankAccountId:"2028140453689352192",refId:`REF-${d}-${start+i}`,transactionAmount:1000,type:"CREDIT",narrative:`test ${start+i}`,transactionTime:`${d}T09:00:00`}));
  return Response.json({status:200,data:{total,page,items}});
 };
 process.env.SYNC_MAX_PAGES="8";
 await db.syncLease.create({data:{id:"bank-sync",token:"busy",expiresAt:new Date(Date.now()+120000)}});
 const skipped=await scheduledSync(now);assert.equal(skipped.skipped,true);
 assert.equal(await db.syncInvocation.count({where:{status:"SKIPPED"}}),1);assert.equal(calls.length,0);
 await db.syncLease.deleteMany();
 for(let i=0;i<12;i++)await scheduledSync(now);
 assert.equal(await db.bankAccount.count({where:{sourceTotalCredit:1000n,sourceTotalDebit:200n,sourceError:""}}),2);
 assert.ok(calls.some(c=>c.size===20));assert.ok(calls.some(c=>c.size===100));
 assert.equal(await db.syncJob.count({where:{kind:{in:["FULL_DAY","PREVIOUS_DAY"]}}}),2,"repeat calls cannot duplicate scheduled slots");
 assert.equal(await db.syncJob.count({where:{kind:{in:["FULL_DAY","PREVIOUS_DAY"]},status:"SUCCESS"}}),2);
 assert.equal(await db.syncJob.count({where:{kind:"HISTORY",status:"SUCCESS"}}),2,"configured history remains resumable alongside daily scans");
 assert.equal(await db.bankTransaction.count(),250,"quick and whole-day sweeps must not double count");
 assert.ok((await db.syncJob.findMany({where:{kind:{in:["FULL_DAY","PREVIOUS_DAY"]}}})).every(j=>j.calls>=2&&j.pages===5),"full sweeps persist page cursors across webhook calls");
 const before=await db.bankTransaction.count();failure=true;await assert.rejects(scheduledSync(now),/test upstream/);
 assert.equal(await db.syncInvocation.count({where:{status:"FAILED"}}),1);assert.equal(await db.syncLease.count(),0);
 failure=false;await scheduledSync(now);assert.equal(await db.bankTransaction.count(),before);
 const later=new Date(`${day}T12:01:00+07:00`);await scheduledSync(later);
 assert.equal(await db.syncJob.count({where:{kind:"FULL_DAY"}}),2,"next slot creates a new whole-day scan");
 assert.equal(await db.syncInvocation.count(),16,"all authenticated calls, including busy and failed, counted");
 console.log("PASS: webhook accounting, overlap skip, 20/100 page sizes, schedule dedup, full-day continuation, retries and no duplicate money");
}finally{globalThis.fetch=originalFetch;await clean();await db.$disconnect();}
