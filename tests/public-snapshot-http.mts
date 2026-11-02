import assert from "node:assert/strict";
const database=new URL(process.env.DATABASE_URL??"https://invalid");
if(database.hostname!=="localhost"||!database.pathname.startsWith("/hvntvn_test"))throw Error("Isolated localhost test DB required");
const {db}=await import("../src/lib/db");
const origin="http://localhost:3010",slug=`snapshot-qa-${Date.now()}`;
const account=await db.bankAccount.create({data:{number:`QA-${Date.now()}`,owner:"QA",label:"QA"}});
const fund=await db.fund.create({data:{accountId:account.id,code:slug,slug,name:"Snapshot QA",adminNote:"PRIVATE-ADMIN-NOTE"}});
try{
 await db.bankTransaction.createMany({data:Array.from({length:105},(_,i)=>({accountId:account.id,fundId:fund.id,sourceId:`snapshot-${i}`,refId:`snapshot-${i}`,amount:BigInt(i+1),direction:"CREDIT" as const,narrative:`QA unique${i} 0912345678`,displayName:"QA",occurredAt:new Date(),sourceHash:`snapshot-${i}`,source:{}}))});
 const get=(query="")=>fetch(`${origin}/api/public/funds/${slug}${query}`);
 const first=await get();assert.equal(first.status,200);assert.equal(first.headers.get("x-public-cache"),"MISS");const initial=await first.json();assert.equal(initial.count,105);
 const second=await get("?page=2");assert.equal(second.headers.get("x-public-cache"),"HIT");const data=await second.json();assert.equal(data.rows.length,5);assert.equal(data.income,initial.income);
 const search=await get("?q=unique104");assert.equal(search.headers.get("x-public-cache"),"HIT");const found=await search.json();assert.equal(found.count,1);assert.equal(found.rows[0].amount,"105");assert.ok(!JSON.stringify(found).includes("0912345678"));assert.ok(!JSON.stringify(found).includes("PRIVATE-ADMIN-NOTE"));
 await db.fund.update({where:{id:fund.id},data:{openingIncome:500n}});
 assert.equal((await (await get()).json()).income,initial.income,"serve previous complete cache until rebuild");
 assert.equal((await fetch(origin+"/api/internal/public-cache",{method:"POST"})).status,401);
 const rebuilt=await fetch(origin+"/api/internal/public-cache?force=1",{method:"POST",headers:{Authorization:`Bearer ${process.env.SYNC_SECRET}`}});assert.equal(rebuilt.status,200);const status=await rebuilt.json();assert.ok(status.built>=1);
 const fresh=await get();assert.equal(fresh.headers.get("x-public-cache"),"HIT");assert.equal((await fresh.json()).income,(BigInt(initial.income)+500n).toString());
 console.log("PASS: cold recovery, warm HIT, cached all-page search/pagination, privacy, stale cache retained until replacement, authenticated full refresh");
}finally{await db.publicCacheRefresh.deleteMany({where:{fundId:fund.id}});await db.bankTransaction.deleteMany({where:{fundId:fund.id}});await db.fund.delete({where:{id:fund.id}});await db.bankAccount.delete({where:{id:account.id}});await db.$disconnect();}
