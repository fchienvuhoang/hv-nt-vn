import assert from "node:assert/strict";
import {Client} from "pg";
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");if(url.hostname!=="localhost"||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Test DB only");
const {db}=await import("../src/lib/db");const {scheduledSync}=await import("../src/lib/scheduled-sync");const {localDate,startOfVietnamDay}=await import("../src/lib/domain");
const fetchOriginal=globalThis.fetch,queryOriginal=Client.prototype.query;
let statements:string[]=[];
Client.prototype.query=new Proxy(queryOriginal,{apply(target,receiver,args){const query=typeof args[0]==="string"?args[0]:args[0]?.text;if(typeof query==="string")statements.push(query);return Reflect.apply(target,receiver,args)}});
async function clean(){await db.tabReclassification.deleteMany();await db.syncInvocation.deleteMany();await db.syncJob.deleteMany();await db.auditLog.deleteMany();await db.syncLease.deleteMany();await db.syncRun.deleteMany();await db.bankTransaction.deleteMany();await db.syncState.deleteMany();await db.fundImport.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany()}
async function run(engine:typeof scheduledSync){
 await clean();const day=localDate(),now=new Date(`${day}T10:01:00+07:00`);
 const accounts=await Promise.all(["0572","0856"].map(number=>db.bankAccount.create({data:{number,owner:"TEST",label:"TEST",syncFrom:startOfVietnamDay(day)}})));
 const fund=await db.fund.create({data:{accountId:accounts[0].id,accountIds:[accounts[1].id],code:"TPBENCH",slug:"test-bench",name:"TEST",keywords:[]}});
 let amount=1000;
 globalThis.fetch=async input=>{
  const u=new URL(String(input));const number=u.pathname.endsWith("transactionsV2")?u.pathname.split("/").at(-2)!:u.searchParams.get("accountNo")!,a=number==="0572";
  if(u.pathname.endsWith("transactionsV2"))return Response.json({status:200,data:{accountNumber:number,username:a?"hvnguyenthuyvnhotritambao":"hvnguyenthuyvnphungsucongdong",userId:a?"2020856147493257216":"2011680198621147136",totalCredit:1000000,totalDebit:1000}});
  const page=Number(u.searchParams.get("page")),date=u.searchParams.get("fromDate"),direction=u.searchParams.get("type");
  return Response.json({status:200,data:{total:20,page,items:Array.from({length:20},(_,i)=>({id:`${number}-${date}-${direction}-${i}`,bankAccountId:a?"2028140453689352192":"2020703240433209344",refId:`TEST-${i}`,transactionAmount:i===0?amount:1000,type:direction,narrative:"TPBENCH",transactionTime:`${date}T09:00:00`}))}});
 };
 for(let i=0;i<4;i++)await engine(now);
 statements=[];const outcomes=[];
 for(let i=1;i<=3;i++)outcomes.push(await engine(new Date(now.getTime()+i*60000)));
 const sql=statements.length,counts={sql,reads:statements.filter(s=>/^SELECT\b/i.test(s.trim())).length,writes:statements.filter(s=>/^(?:INSERT|UPDATE|DELETE|WITH)\b/i.test(s.trim())).length,transactions:statements.filter(s=>/^(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(s.trim())).length};
 assert.ok(outcomes.every(r=>!r.skipped&&r.inserted===0&&r.updated===0));
 assert.equal(await db.bankTransaction.count(),80);
 assert.equal(await db.syncInvocation.count(),0,"journaling is cache-only");
 // A known ID whose source contents changed must still update, preserving manual classification.
 const entry=await db.bankTransaction.findFirstOrThrow({where:{accountId:accounts[0].id,sourceId:{endsWith:"CREDIT-0"}}});await db.bankTransaction.update({where:{id:entry.id},data:{assignment:"MANUAL",fundId:fund.id}});amount=2000;const changed=await engine(new Date(now.getTime()+4*60000));assert.ok(!changed.skipped&&changed.updated===4);assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{id:entry.id}})).assignment,"MANUAL");
 const heartbeat=await engine(new Date(now.getTime()+5*60000));assert.ok(!heartbeat.skipped);assert.ok(heartbeat.balances?.every(a=>a.persisted));
 assert.ok((await db.bankAccount.findMany()).every(a=>a.sourceFetchedAt?.getTime()===now.getTime()+5*60000));
 return counts;
}
try{const measured=await run(scheduledSync);assert.ok(measured.sql<=130,`Idle operation budget exceeded: ${measured.sql}`);console.log("PASS: 3 idle minute calls stay within SQL budget, durable page counters, no duplicate money, known source edits and manual assignment preservation",JSON.stringify(measured));}
finally{globalThis.fetch=fetchOriginal;Client.prototype.query=queryOriginal;await clean();await db.$disconnect()}
