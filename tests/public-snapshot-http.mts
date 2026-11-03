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
const forwarded=await db.fund.create({data:{accountId:account.id,code:slug+"-next",slug:slug+"-next",name:"QA onward recipient"}});
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
 const sourceAfter=await (await get()).json();assert.equal(sourceAfter.goalIncome,(BigInt(initial.income)+400n).toString());assert.equal(sourceAfter.income,(BigInt(initial.income)+500n).toString());assert.equal(sourceAfter.sentAllocation,"100");assert.equal(sourceAfter.count,105);assert.ok(sourceAfter.rows.some((r:{amount:string})=>r.amount==="105"));assert.ok(sourceAfter.rows.every((r:object)=>!("transferTrail" in r)));
 const destinationGet=()=>fetch(`${origin}/api/public/funds/${destination.slug}`);
 const recipient=await(await destinationGet()).json();assert.equal(recipient.goalIncome,"100");assert.equal(recipient.originalIncome,"0");assert.equal(recipient.receivedAllocation,"100");assert.equal(recipient.count,0);assert.equal(recipient.transfers[0].id,moved.id);
 const onwardInput={...input,fromFundId:destination.id,toFundId:forwarded.id,value:"40"},onwardPlan=await previewAllocationTransfer(onwardInput);
 const onward=await commitAllocationTransfer({...onwardInput,requestId:randomUUID(),fingerprint:onwardPlan.fingerprint},actor);await queuePublicRefresh([fund.id,destination.id,forwarded.id]);
 const intermediate=await(await destinationGet()).json(),next=await(await fetch(`${origin}/api/public/funds/${forwarded.slug}`)).json();assert.equal(intermediate.count,0);assert.equal(intermediate.goalIncome,"60");assert.equal(next.count,0);assert.equal(next.goalIncome,"40");assert.equal((await(await get()).json()).count,105);
 await reverseFundTransfer(onward.id,"QA restore onward movement",actor);await queuePublicRefresh([fund.id,destination.id,forwarded.id]);
 // Finish moving the remaining 5 of the same original 105 transaction.
 const boundaryInput={...input,value:"5"},boundaryPlan=await previewAllocationTransfer(boundaryInput);
 const boundary=await commitAllocationTransfer({...boundaryInput,requestId:randomUUID(),fingerprint:boundaryPlan.fingerprint},actor);await queuePublicRefresh([fund.id,destination.id]);
 const fullMoved=await(await get()).json();assert.equal(fullMoved.count,105);assert.ok(fullMoved.rows.some((r:{amount:string})=>r.amount==="105"));assert.equal(fullMoved.sentAllocation,"105");
 assert.equal((await(await destinationGet()).json()).count,0,"fully moved bank transaction must not appear at recipient");
 await reverseFundTransfer(boundary.id,"QA restore final five",actor);await queuePublicRefresh([fund.id,destination.id]);
 assert.equal((await fetch(`${origin}/api/public/funds/${slug}/transfers/${moved.id}`)).status,404,"public transfer details are not exposed");
 await reverseFundTransfer(moved.id,"QA reverse and show original rows",actor);
 await queuePublicRefresh([fund.id,destination.id]);
 const restored=await get();assert.equal(restored.headers.get("x-public-cache"),"MISS");const restoredData=await restored.json();
 assert.equal(restoredData.goalIncome,(BigInt(initial.income)+500n).toString());assert.equal(restoredData.count,105);assert.ok(restoredData.transfers.some((t:{reversal:boolean})=>t.reversal));assert.equal(restoredData.sentAllocation,"0");
 const destinationAfter=await(await destinationGet()).json();assert.equal(destinationAfter.goalIncome,"0");assert.equal(destinationAfter.count,0);
 console.log("PASS: cold recovery, warm HIT, cached all-page search/pagination, privacy, unannounced data stays cached, queued mutation recovers immediately before worker, authenticated full refresh, transfer then reversal immediately restores public original receipts and separate net transfer totals, public transfer detail endpoint removed");
}finally{
 const ids=[fund.id,destination.id,forwarded.id];const transfers=await db.transfer.findMany({where:{fromFundId:{in:ids}},select:{id:true}});
 await db.auditLog.deleteMany({where:{entityId:{in:transfers.map(t=>t.id)}}});
 await db.transfer.deleteMany({where:{fromFundId:{in:ids},reversalOf:{not:null}}});await db.transfer.deleteMany({where:{fromFundId:{in:ids}}});
 await db.publicCacheRefresh.deleteMany({where:{fundId:{in:ids}}});await db.bankTransaction.deleteMany({where:{fundId:{in:ids}}});await db.fund.deleteMany({where:{id:{in:ids}}});await db.bankAccount.delete({where:{id:account.id}});await db.$disconnect();}
