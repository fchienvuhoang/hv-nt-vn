import assert from "node:assert/strict";
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/hvntvn_test")) throw new Error("Require isolated localhost hvntvn_test database");
const {db}=await import("../src/lib/db");
const {serializable}=await import("../src/lib/ledger");
const {validateFundKeywords}=await import("../src/lib/fund-keywords");
if(await db.bankAccount.count())throw new Error("Require empty test database after test:integration");
try {
 const a=await db.bankAccount.create({data:{number:"0572",owner:"TEST",label:"TEST"}});
 const funds=await Promise.all(["TPQA1","TPQA2"].map(code=>db.fund.create({data:{accountId:a.id,code,name:`TEST ${code}`,slug:code.toLowerCase()}})));
 const results=await Promise.allSettled(funds.map((f,i)=>serializable(async tx=>{
   const rules=await tx.fund.findMany({select:{id:true,code:true,name:true,keywords:true}});
   const keywords=validateFundKeywords(f.code,i?"testsharedkey":"TEST SHARED KEY",rules,f.id);
   await tx.fund.update({where:{id:f.id},data:{keywords}});
 })));
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1,"concurrent writes must not claim same canonical keyword");
 const failure=results.find(r=>r.status==="rejected") as PromiseRejectedResult;
 assert.match(String(failure.reason),/trùng từ khóa.*TPQA/);
 assert.equal((await db.fund.findMany()).filter(f=>f.keywords.length>0).length,1);
 console.log("PASS: concurrent keyword edits serialize; only one canonical keyword owner persists and the loser gets the conflicting fund");
} finally {await db.fund.deleteMany();await db.bankAccount.deleteMany();await db.$disconnect();}
