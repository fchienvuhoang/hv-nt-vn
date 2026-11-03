import assert from "node:assert/strict";
const url=new URL(process.env.DATABASE_URL??"https://invalid");if(url.hostname!=="localhost"||!url.pathname.startsWith("/hvntvn_test"))throw Error("Isolated DB only");
const {db}=await import("../src/lib/db"),{prepareBankPage}=await import("../src/lib/bank-ingest-cache"),{ingestBankPage}=await import("../src/lib/ingest-bank");
import type {LedgerClient} from "../src/lib/ledger";
import type {SourceItem} from "../src/lib/source";
let reads=0;const observed=db.$extends({query:{bankTransaction:{findMany({args,query}){reads++;return query(args)}}}});
const memory=new Map<string,unknown>();let writes=0;
const store={get:async(key:string)=>structuredClone(memory.get(key)??null),set:async(key:string,value:unknown)=>{writes++;memory.set(key,structuredClone(value))}};
const now=new Date("2026-11-03T16:00:00+07:00").getTime();
if(await db.bankAccount.count())throw Error("Empty test database required");
try{
 const account=await db.bankAccount.create({data:{number:"0572",owner:"QA",label:"QA"}});
 const fund=await db.fund.create({data:{accountId:account.id,code:"CACHE",name:"QA",slug:"qa-cache",keywords:[]}});
 const item:SourceItem={id:"CACHE-1",bankAccountId:"2028140453689352192",refId:"REF-1",transactionAmount:100,type:"CREDIT",narrative:"CACHE",displayName:"QA",transactionTime:"2026-11-03T10:00:00+07:00"};
 async function run(items:SourceItem[],useCache=true,cache=store,at=now){const page=await prepareBankPage(account.id,items,{store:cache,now:at,useCache});const result=await observed.$transaction(tx=>ingestBankPage(tx as unknown as LedgerClient,account.id,page.items,"QA"));await page.committed();return {...result,knownCount:result.knownCount+page.knownCount}}
 const rollback=await prepareBankPage(account.id,[item],{store,now});
 await assert.rejects(observed.$transaction(async tx=>{await ingestBankPage(tx as unknown as LedgerClient,account.id,rollback.items,"QA");throw Error("ROLLBACK")}),/ROLLBACK/);
 assert.equal(writes,0);assert.equal(await db.bankTransaction.count(),0);assert.equal((await prepareBankPage(account.id,[item],{store,now})).items.length,1);
 assert.equal((await run([item])).inserted,1);assert.equal(writes,1);
 const before=reads,writeBefore=writes;const hit=await run([item]);assert.equal(hit.knownCount,1);assert.equal(hit.inserted,0);assert.equal(reads,before,"cached identical page performs ZERO BankTransaction findMany queries");assert.equal(writes,writeBefore,"cache hits do not rewrite buckets");
 assert.ok(!JSON.stringify([...memory.values()]).includes("QA"));assert.ok(!JSON.stringify([...memory.values()]).includes("CACHE-1"));
 const row=await db.bankTransaction.findUniqueOrThrow({where:{accountId_sourceId:{accountId:account.id,sourceId:item.id}}});
 await db.bankTransaction.update({where:{id:row.id},data:{assignment:"MANUAL",matchReason:"QA manual"}});await db.transactionNote.create({data:{requestId:"qa-cache-note",transactionId:row.id,text:"QA preserved note",kind:"NOTE",actor:"QA"}});
 assert.equal((await run([{...item,transactionAmount:200}])).updated,1);const corrected=await db.bankTransaction.findUniqueOrThrow({where:{id:row.id},include:{notes:true}});assert.equal(corrected.amount,200n);assert.equal(corrected.fundId,fund.id);assert.equal(corrected.assignment,"MANUAL");assert.equal(corrected.notes.length,1);
 const baseline=reads;await run([{...item,transactionAmount:200}],false);assert.equal(reads,baseline+1,"full reconciliation bypasses cached fingerprints");
 assert.equal((await run([{...item,id:"CACHE-2",transactionAmount:200}])).inserted,1,"different source ID is a different transaction even at the same amount");
 const expired=reads;await run([{...item,transactionAmount:200}],true,store,now+73*3600000);assert.ok(reads>expired,"older-than-72h transactions fall back to DB");
 const broken={get:async()=>{throw Error("cache unavailable")},set:async()=>{throw Error("cache unavailable")}};
 assert.equal((await run([{...item,id:"CACHE-3"}],true,broken)).inserted,1,"cache failures cannot lose a committed bank insert");
 assert.equal((await run([])).inserted,0);
 console.log("PASS: zero transaction lookups on warm page, no cache writes on hits/rollback, source corrections preserve manual assignment/notes, distinct IDs stay distinct, audit bypass, 72h expiry, cache outage falls back to DB");
}finally{await db.auditLog.deleteMany();await db.bankTransaction.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();await db.$disconnect()}
