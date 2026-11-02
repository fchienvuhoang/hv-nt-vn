import assert from "node:assert/strict";
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(url.hostname!=="localhost"||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Isolated localhost test DB only");
const origin=process.env.QA_ORIGIN??"http://localhost:3004";
if(!origin.startsWith("http://localhost:"))throw new Error("Localhost only");
const {db}=await import("../src/lib/db");
const {fundTotals}=await import("../src/lib/ledger");
const {encode}=await import("next-auth/jwt");
if(await db.bankAccount.count())throw new Error("Empty QA DB required");
try{
 const a=await db.bankAccount.create({data:{number:"0572",owner:"QA",label:"My"}}),b=await db.bankAccount.create({data:{number:"0856",owner:"QA",label:"Trâm"}});
 const source=await db.fund.create({data:{accountId:a.id,accountIds:[b.id],code:"PERFA",name:"QA performance A",slug:"qa-perf-a",keywords:[],openingIncome:1000n,adminNote:"PRIVATE-NOTE-NEVER-PUBLIC"}});
 const target=await db.fund.create({data:{accountId:a.id,accountIds:[b.id],code:"PERFB",name:"QA performance B",slug:"qa-perf-b",keywords:[]}});
 const opening=await db.fundImport.create({data:{fundId:source.id,accountId:b.id,fileName:"QA.xlsx",fileHash:"QA",sheetName:"QA",actor:"qa",rowCount:1,income:0n,expense:0n,sample:[],data:[],errors:[]}});
 const make=(id:string,accountId:string,amount:bigint,direction:"CREDIT"|"DEBIT"="CREDIT",entryStatus="POSTED")=>db.bankTransaction.create({data:{accountId,fundId:source.id,sourceId:id,refId:id,narrative:`QA ${id} 0912345678`,displayName:"QA",amount,direction,entryStatus,...(entryStatus==="OPENING"?{origin:"EXCEL",assignment:"MANUAL" as const,importId:opening.id}:{}),occurredAt:new Date(`2026-11-01T09:${String(Number(id.replace(/\D/g,""))%60).padStart(2,"0")}:00Z`),sourceHash:id,source:{qa:true}}});
 for(let i=1;i<=101;i++)await make(`PERF-${i}`,i%2?a.id:b.id,BigInt(i));
 await make("EXPENSE-1",a.id,70n,"DEBIT");await make("OPENING-2",b.id,11n,"DEBIT","OPENING");
 const split=await make("SPLIT-3",a.id,200n);
 await db.fundAllocation.createMany({data:[{transactionId:split.id,fundId:source.id,accountId:a.id,amount:120n},{transactionId:split.id,fundId:target.id,accountId:a.id,amount:80n}]});
 await db.transfer.create({data:{requestId:crypto.randomUUID(),fromFundId:source.id,toFundId:target.id,accountId:a.id,amount:25n,reason:"QA balance transfer",actor:"qa"}});
 const all=await fundTotals();
 const canonical=(f:typeof all[number])=>JSON.stringify({...f,byAccount:[...f.byAccount].sort((a,b)=>a.accountId.localeCompare(b.accountId))},(_,v)=>typeof v==="bigint"?v.toString():v);
 for(const f of all){const scoped=await fundTotals(db,f.id);assert.equal(scoped.length,1);assert.equal(canonical(scoped[0]),canonical(f),"scoped totals must preserve all amounts, opening balances, allocations, transfers and counts");}
 const page=await fetch(origin+"/t/qa-perf-a");assert.equal(page.status,200);assert.match(page.headers.get("cache-control")??"",/s-maxage=/);
 const html=await page.text();assert.ok(html.includes("Đang tải số liệu và giao dịch"));assert.ok(html.includes("Danh sách hùn phước"));assert.ok(!html.includes("PERF-"),"cached shell must not contain ledger data");assert.ok(!html.includes("0912345678")&&!html.includes("PRIVATE-NOTE-NEVER-PUBLIC"));
 const warm=await fetch(origin+"/t/qa-perf-a");assert.equal(warm.headers.get("x-nextjs-cache"),"HIT");
 const credit=await (await fetch(origin+"/api/public/funds/qa-perf-a")).json();assert.equal(credit.count,102);assert.equal(credit.rows.length,100);assert.equal(credit.income,"6271");assert.equal(credit.balance,"6165");
 const debit=await (await fetch(origin+"/api/public/funds/qa-perf-a?type=DEBIT")).json();assert.equal(debit.count,2);assert.equal(debit.rows.length,2);assert.equal(debit.expense,"81");
 const second=await (await fetch(origin+"/api/public/funds/qa-perf-a?page=2")).json();assert.equal(second.rows.length,2);
 const search=await (await fetch(origin+"/api/public/funds/qa-perf-a?q=SPLIT-3")).json();assert.equal(search.count,1);assert.equal(search.rows[0].amount,"120");
 const filtered=await fetch(origin+"/t/qa-perf-a?type=DEBIT&q=EXPENSE-1");assert.equal(filtered.status,200);assert.ok((await filtered.text()).includes("Đang tải số liệu và giao dịch"),"URL filters are applied by REST after static hydration");
 if(!process.env.AUTH_SECRET)throw new Error("QA auth secret required");
 const token=await encode({token:{email:"qa-admin@example.test",name:"QA",sub:"qa"},secret:process.env.AUTH_SECRET,salt:"authjs.session-token",maxAge:3600});
 const body=new FormData();body.set("transactionId",split.id);body.set("sourceFundId",source.id);body.set("fundId",target.id);body.set("reason","QA public cache invalidation");
 const moved=await fetch(origin+"/api/admin/transactions/assignment",{method:"POST",headers:{Origin:origin,Cookie:`authjs.session-token=${token}`},body});assert.equal(moved.status,200);assert.ok((await moved.json()).success);
 const fresh=await (await fetch(origin+"/api/public/funds/qa-perf-a")).json();assert.equal(fresh.income,"6151");assert.equal(fresh.count,101);
 console.log("PASS: static public HTML/cache HIT, scoped ledger equivalence with allocations/openings/transfers, REST filtering/pagination/search, privacy, mutation invalidation");
}finally{if(process.env.QA_KEEP!=="1"){await db.transfer.deleteMany();await db.auditLog.deleteMany();await db.bankTransaction.deleteMany();await db.fundImport.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();}await db.$disconnect();}
