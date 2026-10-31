import assert from "node:assert/strict";
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(!["localhost","127.0.0.1"].includes(url.hostname)||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Require isolated test database");
const {db}=await import("../src/lib/db");const {transactionSummary}=await import("../src/lib/transaction-summary");const {refreshSourceBalances}=await import("../src/lib/source-balance-sync");const {balanceProfiles}=await import("../src/lib/source-balance");
if(await db.bankAccount.count())throw new Error("Require empty test database");
const original=globalThis.fetch;
try{
 const accounts=await Promise.all(["0572","0856"].map(number=>db.bankAccount.create({data:{number,owner:"TEST",label:"TEST"}})));
 let fail=false;globalThis.fetch=async input=>{const number=new URL(String(input)).pathname.split("/").at(-2)!;const profile=balanceProfiles[number];if(fail&&number==="0572")throw new Error("TEST outage");return Response.json({status:200,data:{username:profile.username,userId:profile.userId,accountNumber:number,totalCredit:number==="0572"?"1000000":"2000000",totalDebit:"250000"}})};
 assert.ok((await refreshSourceBalances(accounts)).every(r=>r.ok));
 const make=(i:number,time:string,direction:"CREDIT"|"DEBIT",amount:bigint,entryStatus="POSTED",origin="BANK")=>db.bankTransaction.create({data:{accountId:accounts[i%2].id,sourceId:`STATS-${i}`,refId:"TEST",source:{test:true},sourceHash:"TEST",occurredAt:new Date(time),direction,amount,narrative:"TEST",displayName:"TEST",entryStatus,origin}});
 await make(0,"2026-10-30T17:00:00Z","CREDIT",100n); // exactly Vietnam today
 await make(1,"2026-10-30T16:59:59Z","CREDIT",200n);
 await make(2,"2026-10-29T17:00:00Z","DEBIT",50n,"POSTED","EXCEL");
 await make(3,"2026-10-28T17:00:00Z","DEBIT",25n);
 await make(4,"2026-10-28T16:59:59Z","CREDIT",999n); // fourth day inside ten-day window
 await make(5,"2026-10-30T18:00:00Z","CREDIT",999n,"REVIEW");await make(6,"2026-10-30T18:00:00Z","CREDIT",999n,"MERGED");
 await make(7,"2026-10-31T17:00:00Z","CREDIT",999n); // next Vietnam day
 await make(8,"2026-10-21T17:00:00Z","CREDIT",75n); // oldest included Vietnam day
 await make(9,"2026-10-21T16:59:59Z","CREDIT",888n); // before ten-day window
 const now=new Date("2026-10-31T16:59:00Z"),summary=await transactionSummary(now);
 assert.deepEqual(summary.days.slice(0,3),[{date:"2026-10-31",incomeCount:1,income:100n,expenseCount:0,expense:0n},{date:"2026-10-30",incomeCount:1,income:200n,expenseCount:1,expense:50n},{date:"2026-10-29",incomeCount:0,income:0n,expenseCount:1,expense:25n}]);assert.equal(summary.days.length,10);assert.equal(summary.days[3].income,999n);assert.equal(summary.days[9].date,"2026-10-22");assert.equal(summary.days[9].income,75n);assert.equal(summary.totalBalance,2500000n);
 const before=await db.bankAccount.findUniqueOrThrow({where:{id:accounts[0].id}});fail=true;const statuses=await refreshSourceBalances(accounts);assert.equal(statuses[0].ok,false);assert.equal(statuses[1].ok,true);
 const after=await db.bankAccount.findUniqueOrThrow({where:{id:accounts[0].id}});assert.equal(after.sourceTotalCredit,before.sourceTotalCredit);assert.equal(after.sourceFetchedAt?.getTime(),before.sourceFetchedAt?.getTime());assert.match(after.sourceError,/TEST outage/);assert.equal((await transactionSummary(now)).totalBalance,2500000n);
 await db.bankAccount.update({where:{id:accounts[1].id},data:{sourceTotalCredit:null}});assert.equal((await transactionSummary(now)).totalBalance,null);
 console.log("PASS: ten Vietnam days and midnight bounds, both accounts/directions, exact totals, exclude review/merged/old/future days, source snapshots, partial failure preserves old balance, missing source never treated as zero");
}finally{globalThis.fetch=original;await db.bankTransaction.deleteMany();await db.bankAccount.deleteMany();await db.$disconnect()}
