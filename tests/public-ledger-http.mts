import assert from "node:assert/strict";
const testUrl=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(!["localhost","127.0.0.1"].includes(testUrl.hostname)||!testUrl.pathname.startsWith("/hvntvn_test"))throw new Error("Require isolated localhost hvntvn_test database");
const {db}=await import("../src/lib/db");
const origin=process.env.QA_ORIGIN??"http://localhost:3001";
if(!origin.startsWith("http://localhost:"))throw new Error("QA is localhost only");
const account=await db.bankAccount.findFirstOrThrow();
const fund=await db.fund.create({data:{accountId:account.id,code:"PUBLICSEARCHQA",slug:`public-search-${Date.now()}`,name:"TEST public search",keywords:[]}});
const html=async (query="")=>{const response=await fetch(`${origin}/t/${fund.slug}${query}`);assert.equal(response.status,200);return response.text()};
const rowCount=(page:string)=>(page.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1].match(/<tr[ >]/g)??[]).length;
try{
 await db.bankTransaction.createMany({data:Array.from({length:205},(_,i)=>({accountId:account.id,sourceId:`${fund.id}-${i}`,refId:`${i}`,fundId:fund.id,amount:150000n,direction:"CREDIT" as const,narrative:`Nguyễn Mai hùn phước ${i===0?"BEYONDPAGE":"COMMON"} 0912345678`,displayName:"Nguyễn Mai",occurredAt:new Date(2026,9,31,0,0,i),sourceHash:"QA",source:{test:true}}))});
 const annotated=await db.bankTransaction.findFirstOrThrow({where:{fundId:fund.id,refId:"0"}});
 await db.transactionNote.create({data:{transactionId:annotated.id,requestId:`QA-${fund.id}`,text:"Quản trị viên đã điều chuyển NOTESEARCH 0987654321",actor:"qa-private@example.test",actorId:"PRIVATE-QA-ID",actorName:"QA admin"}});
 const noteHtml=await html("?q=notesearch");assert.equal(rowCount(noteHtml),1);assert.ok(noteHtml.includes("Ghi chú quản trị:"));assert.ok(noteHtml.includes("*******321"));assert.ok(!noteHtml.includes("0987654321"));assert.ok(!noteHtml.includes("PRIVATE-QA-ID"));assert.ok(!noteHtml.includes("qa-private@example.test"));
 const apiResponse=await fetch(`${origin}/api/public/funds/${fund.slug}?q=notesearch`);assert.equal(apiResponse.status,200);assert.match(apiResponse.headers.get("content-type")??"",/application\/json/);const publicJson=await apiResponse.text();const publicData=JSON.parse(publicJson);assert.equal(publicData.rows.length,1);assert.ok(!("id" in publicData));for(const hidden of ["0987654321","0912345678","qa-private@example.test","PRIVATE-QA-ID"])assert.ok(!publicJson.includes(hidden));
 const first=await html();assert.equal(rowCount(first),100);assert.ok(first.includes("205<!-- --> giao dịch"));
 assert.equal(rowCount(await html("?page=2")),100);assert.equal(rowCount(await html("?page=3")),5);
 const found=await html("?q=beyondpage");assert.equal(rowCount(found),1);assert.ok(found.includes("BEYONDPAGE"),"search must reach a transaction beyond the first 100 rows");
 assert.equal(rowCount(await html("?q=NGUYEN+mai&page=3")),5);
 assert.equal(rowCount(await html("?q=678")),100);
 assert.equal(rowCount(await html("?q=0912345678")),0,"masked digits cannot be searched");
 assert.equal(rowCount(await html("?q=150000&page=3")),5);
 assert.equal(rowCount(await html("?type=DEBIT&q=Mai")),0);
 const empty=await html("?q=NOTFOUND");assert.ok(empty.includes("Không tìm thấy giao dịch phù hợp"));assert.ok(empty.includes("30.750.000"),"search must preserve full fund totals");
 // A different search reuses cached public rows, rather than querying raw private data.
 await db.bankTransaction.updateMany({where:{fundId:fund.id},data:{narrative:"CHANGEDAFTERCACHE"}});
 assert.equal(rowCount(await html("?q=CHANGEDAFTERCACHE")),0);
 assert.ok(!(await html()).includes("0912345678"));
 console.log("PASS: public 100-row pagination, whole-history search, accent/case, amount, masked phone suffix, direction isolation, unchanged totals and shared cached rows across queries");
}finally{await db.bankTransaction.deleteMany({where:{fundId:fund.id}});await db.fund.delete({where:{id:fund.id}});await db.$disconnect()}
