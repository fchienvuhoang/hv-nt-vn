import assert from "node:assert/strict";
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(!["localhost","127.0.0.1"].includes(url.hostname)||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Require isolated test DB");
const {db}=await import("../src/lib/db");const origin=process.env.QA_ORIGIN??"http://localhost:3001";if(!origin.startsWith("http://localhost:"))throw new Error("Localhost only");
if(await db.bankAccount.count())throw new Error("Require empty test DB");
const account=await db.bankAccount.create({data:{number:"0572",owner:"TEST",label:"TEST"}});
const suffix=String(Date.now());
try{
 const funds=await Promise.all(Array.from({length:15},(_,i)=>db.fund.create({data:{accountId:account.id,code:`DIR${i}`,slug:`directory-${suffix}-${i}`,name:`TEST directory ${i}`,keywords:[],status:i===13?"PAUSED":i===14?"COMPLETED":"ACTIVE",createdById:"PRIVATEACTOR",createdByName:"PRIVATEACTOR"}})));
 await db.bankTransaction.createMany({data:Array.from({length:253},(_,i)=>({accountId:account.id,fundId:funds[i===251?1:i===252?13:0].id,sourceId:`DIRECTORY-${i}`,refId:"TEST",amount:150000n,direction:i===251?"DEBIT" as const:"CREDIT" as const,occurredAt:new Date(2026,9,31,0,0,i),narrative:i===252?"PAUSEDSECRET":`Nguyễn Mai ${i===0?"DEEPMATCH":"COMMON"} 0912345678`,hiddenNarrative:i===250,displayName:"Nguyễn Mai",sourceHash:"TEST",source:{private:"RAWSECRET"}}))});
 const transaction=await db.bankTransaction.findFirstOrThrow({where:{fundId:funds[1].id}});await db.transactionNote.create({data:{transactionId:transaction.id,requestId:`DIRECTORY-${suffix}`,text:"NOTEFOUND 0987654321",actor:"PRIVATEACTOR",actorName:"PRIVATEACTOR",actorId:"PRIVATEACTOR"}});
 const get=async(q="",page=1)=>{const response=await fetch(`${origin}/api/public/funds?${new URLSearchParams({q,page:String(page)})}`);assert.equal(response.status,200);const text=await response.text();const {search,...visible}=JSON.parse(text);void search;const visibleText=JSON.stringify(visible);for(const secret of ["0912345678","0987654321","PRIVATEACTOR","RAWSECRET",funds[0].id])assert.ok(!visibleText.includes(secret),`leaked ${secret}`);return JSON.parse(text)};
 const first=await get();assert.equal(first.count,13);assert.equal(first.funds.length,12);assert.equal((await get("",2)).funds.length,1);assert.ok(first.funds.every((f:{code:string})=>!["DIR13","DIR14"].includes(f.code)));
 const deep=await get("deepmatch");assert.equal(deep.count,1);assert.equal(deep.transactionCount,1);assert.equal(deep.funds[0].code,"DIR0");assert.match(deep.funds[0].previews[0].narrative,/\*{7}678/);
 assert.equal((await get("NGUYEN mai")).transactionCount,252);assert.equal((await get("0912345678")).count,0);assert.equal((await get("PAUSEDSECRET")).count,0);
 const notes=await get("notefound");assert.equal(notes.count,1);assert.equal(notes.funds[0].code,"DIR1");assert.equal(notes.funds[0].previews[0].direction,"DEBIT");assert.match(notes.funds[0].previews[0].notes[0].text,/\*{7}321/);
 assert.equal((await get("DIR12")).count,1);assert.equal((await get("COMMON")).funds[0].previews.length,3);
 const html=await(await fetch(`${origin}/t?q=deepmatch`)).text();assert.ok(html.includes(funds[0].slug));assert.ok(html.includes("DEEPMATCH"));assert.ok(!html.includes("0912345678"));assert.ok(!html.includes("Đăng nhập quản trị"));
 await db.bankTransaction.updateMany({where:{fundId:funds[0].id},data:{narrative:"CHANGEDAFTERCACHE"}});assert.equal((await get("CHANGEDAFTERCACHE")).count,0,"new query reuses cached masked blocks");
 console.log("PASS: anonymous active-only directory, pagination, global search beyond first block, both directions, names/accents/codes, notes, phone masking and hidden digits, no private actor/raw payload, SSR detail links and cached search blocks");
}finally{await db.bankTransaction.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();await db.$disconnect()}
