import assert from "node:assert/strict";
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");if(url.hostname!=="localhost"||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Test DB only");
if(!process.env.SYNC_SECRET?.startsWith("qa-only-"))throw new Error("QA webhook secret required");
const {db}=await import("../src/lib/db"),{localDate,startOfVietnamDay}=await import("../src/lib/domain");
const origin="http://localhost:3001";if(await db.bankAccount.count())throw new Error("Empty DB required");
try{
 const accounts=await Promise.all(["0572","0856"].map(number=>db.bankAccount.create({data:{number,owner:"TEST",label:"TEST",syncFrom:startOfVietnamDay(localDate())}})));
 const funds=await Promise.all(["TPCA","TPCB"].map(code=>db.fund.create({data:{code,slug:`cache-${code.toLowerCase()}`,name:`TEST ${code}`,keywords:[],accountId:accounts[0].id,accountIds:[accounts[1].id],publicListed:true}})));
 const a=await db.bankTransaction.create({data:{accountId:accounts[0].id,fundId:funds[0].id,sourceId:"HOOK-A",refId:"HOOK-A",amount:1000n,direction:"CREDIT",narrative:"TPCA OLDHOOK",displayName:"TEST",occurredAt:new Date(`${localDate()}T10:00:00+07:00`),source:{test:true},sourceHash:"OLD",assignment:"MANUAL"}});
 const b=await db.bankTransaction.create({data:{accountId:accounts[1].id,fundId:funds[1].id,sourceId:"HOOK-B",refId:"HOOK-B",amount:500n,direction:"CREDIT",narrative:"TPCB OTHERCACHE",displayName:"TEST",occurredAt:a.occurredAt,source:{test:true},sourceHash:"OLD"}});
 const fund=async(slug:string)=>{const response=await fetch(`${origin}/api/public/funds/${slug}`);assert.equal(response.status,200);return response.json()};
 const search=async(q:string)=>{const response=await fetch(`${origin}/api/public/funds?q=${q}`);assert.equal(response.status,200);return response.json()};
 assert.equal((await fund(funds[0].slug)).income,"1000");assert.equal((await fund(funds[1].slug)).income,"500");await search("OTHERCACHE");
 // Unannounced test-only mutation makes an untouched cache distinguishable from a global flush.
 await db.bankTransaction.update({where:{id:b.id},data:{amount:900n}});
 const hook=async()=>{const response=await fetch(origin+"/api/sync/transactions",{method:"POST",headers:{Authorization:`Bearer ${process.env.SYNC_SECRET}`}});assert.equal(response.status,200);return response.json()};
 const first=await hook();assert.ok(first.updated>=1);assert.deepEqual(first.affectedFundIds,[funds[0].id]);
 assert.equal((await fund(funds[0].slug)).income,"2000");assert.equal((await fund(funds[0].slug)).rows[0].amount,"2000");
 assert.equal((await fund(funds[1].slug)).income,"500","unaffected summary must retain cache");assert.equal((await fund(funds[1].slug)).rows[0].amount,"500","unaffected rows must retain cache");
 const found=await search("FRESHHOOK");assert.equal(found.transactionCount,1);assert.equal(found.funds[0].previews[0].amount,"2000");
 const second=await hook();assert.equal(second.updated,0);assert.equal(second.inserted,0);assert.ok(second.balances.every((a:{persisted:boolean})=>!a.persisted));
 assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{id:a.id}})).assignment,"MANUAL");
 console.log("PASS: real webhook invalidates only affected public fund/rows, global search reuses fresh per-fund cache, untouched funds stay cached, no-change heartbeat skips writes and manual classification survives");
}finally{await db.syncInvocation.deleteMany();await db.syncJob.deleteMany();await db.auditLog.deleteMany();await db.syncLease.deleteMany();await db.bankTransaction.deleteMany();await db.syncState.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();await db.$disconnect()}
