import assert from "node:assert/strict";
const database=new URL(process.env.DATABASE_URL??"https://invalid");
if(database.hostname!=="localhost"||!database.pathname.startsWith("/hvntvn_test"))throw Error("Isolated localhost test DB required");
const {db}=await import("../src/lib/db");
const {previewAllocationTransfer,commitAllocationTransfer}=await import("../src/lib/allocation-transfers");
const {reverseFundTransfer}=await import("../src/lib/transfers");
const {queuePublicRefresh}=await import("../src/lib/public-snapshot");
const {randomUUID}=await import("node:crypto");
const origin="http://localhost:3010",slug=`snapshot-qa-${Date.now()}`;
const account=await db.bankAccount.create({data:{number:`QA-${Date.now()}`,owner:"QA",label:"QA"}});
const fund=await db.fund.create({data:{accountId:account.id,code:slug,slug,name:"Snapshot QA",adminNote:"PRIVATE-ADMIN-NOTE"}});
const destination=await db.fund.create({data:{accountId:account.id,code:slug+"-to",slug:slug+"-to",name:"Snapshot destination QA"}});
try{
 await db.bankTransaction.createMany({data:Array.from({length:105},(_,i)=>({accountId:account.id,fundId:fund.id,sourceId:`snapshot-${i}`,refId:`snapshot-${i}`,amount:BigInt(i+1),direction:"CREDIT" as const,narrative:`QA unique${i} 0912345678`,displayName:"QA",occurredAt:new Date(),sourceHash:`snapshot-${i}`,source:{}}))});
 const get=(query="")=>fetch(`${origin}/api/public/funds/${slug}${query}`);
 const first=await get();assert.equal(first.status,200);assert.equal(first.headers.get("x-public-cache"),"MISS");const initial=await first.json();assert.equal(initial.count,105);
 const second=await get("?page=2");assert.equal(second.headers.get("x-public-cache"),"HIT");const data=await second.json();assert.equal(data.rows.length,5);assert.equal(data.income,initial.income);
 const search=await get("?q=unique104");assert.equal(search.headers.get("x-public-cache"),"HIT");const found=await search.json();assert.equal(found.count,1);assert.equal(found.rows[0].amount,"105");assert.ok(!JSON.stringify(found).includes("0912345678"));assert.ok(!JSON.stringify(found).includes("PRIVATE-ADMIN-NOTE"));
 await db.fund.update({where:{id:fund.id},data:{openingIncome:500n}});
 assert.equal((await (await get()).json()).income,initial.income,"serve previous complete cache until rebuild");
 // A committed mutation queues a new revision. Reads must recover immediately,
 // even while the background worker has not rebuilt anything yet.
 await db.publicCacheRefresh.upsert({where:{fundId:fund.id},create:{fundId:fund.id,requestedVersion:1},update:{requestedVersion:{increment:1}}});
 const afterMutation=await get();assert.equal(afterMutation.headers.get("x-public-cache"),"MISS");assert.equal((await afterMutation.json()).income,(BigInt(initial.income)+500n).toString());
 assert.equal((await get()).headers.get("x-public-cache"),"HIT","snapshot of current requested revision is reusable even before worker finishes");
 assert.equal((await fetch(origin+"/api/internal/public-cache",{method:"POST"})).status,401);
 const rebuilt=await fetch(origin+"/api/internal/public-cache?force=1",{method:"POST",headers:{Authorization:`Bearer ${process.env.SYNC_SECRET}`}});assert.equal(rebuilt.status,200);const status=await rebuilt.json();assert.ok(status.built>=1);
 const fresh=await get();assert.equal(fresh.headers.get("x-public-cache"),"HIT");assert.equal((await fresh.json()).income,(BigInt(initial.income)+500n).toString());
 const actor={id:"qa-snapshot",name:"QA",email:"qa@example.test"};
 const input={fromFundId:fund.id,toFundId:destination.id,mode:"AMOUNT" as const,value:"100",reason:"QA transfer cache regression"};
 const preview=await previewAllocationTransfer(input);
 const moved=await commitAllocationTransfer({...input,requestId:randomUUID(),fingerprint:preview.fingerprint},actor);
 await queuePublicRefresh([fund.id,destination.id]);
 assert.equal((await (await get()).json()).goalIncome,(BigInt(initial.income)+400n).toString());
 const destinationGet=()=>fetch(`${origin}/api/public/funds/${destination.slug}`);
 assert.equal((await (await destinationGet()).json()).goalIncome,"100");
 const detail=await fetch(`${origin}/api/public/funds/${slug}/transfers/${moved.id}`);assert.equal(detail.status,200);const detailData=await detail.json();assert.equal(detailData.amount,"100");assert.equal(detailData.items[0].originalAmount,"105");assert.equal(detailData.items[0].sourceAfter,"5");
 const text=JSON.stringify(detailData);assert.ok(!text.includes("0912345678"));assert.ok(!text.includes("qa@example.test"));assert.ok(!text.includes("PRIVATE-ADMIN-NOTE"));assert.ok(!text.includes("sourceHash"));assert.ok(!("snapshot" in detailData.items[0]));
 assert.equal((await fetch(`${origin}/api/public/funds/unrelated-qa/transfers/${moved.id}`)).status,404);
 const movedItem=await db.transferItem.findFirstOrThrow({where:{transferId:moved.id}});await db.bankTransaction.update({where:{id:movedItem.transactionId},data:{hiddenNarrative:true}});
 const hidden=await(await fetch(`${origin}/api/public/funds/${slug}/transfers/${moved.id}`)).json();assert.equal(hidden.items[0].narrative,"Nội dung được ẩn theo nguồn sao kê");await db.bankTransaction.update({where:{id:movedItem.transactionId},data:{hiddenNarrative:false}});

 await reverseFundTransfer(moved.id,"QA reverse and show original rows",actor);
 await queuePublicRefresh([fund.id,destination.id]);
 const restored=await get();assert.equal(restored.headers.get("x-public-cache"),"MISS");const restoredData=await restored.json();
 assert.equal(restoredData.goalIncome,(BigInt(initial.income)+500n).toString());assert.equal(restoredData.count,105);assert.ok(restoredData.rows.some((r:{transferTrail:{reversal:boolean}[]})=>r.transferTrail.some(t=>t.reversal)));
 const destinationAfter=await(await destinationGet()).json();assert.equal(destinationAfter.goalIncome,"0");assert.equal(destinationAfter.count,1);assert.equal(destinationAfter.rows[0].amount,"0");
 console.log("PASS: cold recovery, warm HIT, cached all-page search/pagination, privacy, unannounced data stays cached, queued mutation recovers immediately before worker, authenticated full refresh, transfer then reversal immediately restores both public totals/rows/history, masked transfer detail endpoint and unrelated-slug isolation");
}finally{
 const ids=[fund.id,destination.id];const transfers=await db.transfer.findMany({where:{fromFundId:{in:ids}},select:{id:true}});
 await db.auditLog.deleteMany({where:{entityId:{in:transfers.map(t=>t.id)}}});
 await db.transfer.deleteMany({where:{fromFundId:{in:ids},reversalOf:{not:null}}});await db.transfer.deleteMany({where:{fromFundId:{in:ids}}});
 await db.publicCacheRefresh.deleteMany({where:{fundId:{in:ids}}});await db.bankTransaction.deleteMany({where:{fundId:{in:ids}}});await db.fund.deleteMany({where:{id:{in:ids}}});await db.bankAccount.delete({where:{id:account.id}});await db.$disconnect();}
