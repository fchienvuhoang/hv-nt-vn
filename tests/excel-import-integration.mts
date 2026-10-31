import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(!["localhost","127.0.0.1"].includes(url.hostname)||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Require isolated localhost hvntvn_test database");
const {db}=await import("../src/lib/db");
const {stageFundImport,processFundImport}=await import("../src/lib/fund-imports");
const {serializable,fundTotals,accountTotals}=await import("../src/lib/ledger");
const {ingestBankPage}=await import("../src/lib/ingest-bank");
const {reviewEntry}=await import("../src/lib/review-entry");
const {transferFunds}=await import("../src/lib/transfers");
const {synchronize}=await import("../src/lib/sync");
const {localDate}=await import("../src/lib/domain");
const originalFetch=globalThis.fetch;
const today=localDate();
let seeded=false;
async function file(sheets:{name:string;rows:(string|number)[][];summary?:[number,number];merge?:boolean}[]){
  const workbook=new ExcelJS.Workbook();
  for(const input of sheets){
    const sheet=workbook.addWorksheet(input.name);
    sheet.addRow(["TP - HISTORY"]);sheet.addRow(["STT","Thời gian","Chủ tài khoản","Nội dung","Tiền ra","Tiền vào/ Số m2 đã thành tựu","Ghi chú"]);
    sheet.addRow(["","","","",input.summary?.[0]??input.rows.reduce((n,r)=>n+Number(r[4]||0),0),input.summary?.[1]??input.rows.reduce((n,r)=>n+Number(r[5]||0),0)]);
    sheet.addRow(["","","","","",273]);
    for(const row of input.rows)sheet.addRow(row);
    if(input.merge)sheet.mergeCells("D5:E5");
  }
  const bytes=await workbook.xlsx.writeBuffer();return new File([new Uint8Array(bytes)],"history.xlsx",{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
async function finish(batchId:string,extra={replaceLegacy:false,acceptMismatch:false}){let result;do{result=await processFundImport({batchId,...extra},"test");}while(result.status!=="COMPLETE");return result;}
try{
  assert.equal(await db.bankAccount.count(),0,"Run test:integration first");seeded=true;
  const a=await db.bankAccount.create({data:{number:"0572",owner:"TEST",label:"TEST A"}}),b=await db.bankAccount.create({data:{number:"0856",owner:"TEST",label:"TEST B"}});
  const fund=await db.fund.create({data:{accountId:a.id,code:"TPOLD",name:"TEST OLD",slug:"test-old",keywords:[],status:"COMPLETED"}});
  const target=await db.fund.create({data:{accountId:a.id,accountIds:[b.id],code:"TPTARGET",name:"TEST TARGET",slug:"test-target",keywords:[]}});
  globalThis.fetch=async input=>Response.json({status:200,data:{total:0,page:Number(new URL(String(input)).searchParams.get("page")),items:[]}});
  assert.equal((await synchronize("test")).pending,false,"Sync must work without any finalized/trial account");
  assert.equal((await db.bankAccount.findUniqueOrThrow({where:{id:a.id}})).finalizedAt,null);
  const rows=Array.from({length:25},(_,i)=>[i+1,`${today} 10:${String(i).padStart(2,"0")}`,"TEST",`TPOLD donor ${i}`,"",1000,""]);
  rows.push([26,`${today} 11:00`,"","Old expense",200,"",""]);
  const upload=await file([{name:"TK MY",rows,merge:true},{name:"TK TRÂM",rows:[[1,`${today} 12:00`,"","TPOLD secondary","",5000,""]]}]);
  const staged=await stageFundImport(fund.id,upload,"test");assert.equal(staged.length,2);
  assert.equal(staged[0].accountId,a.id);assert.equal(staged[1].accountId,b.id);
  assert.equal(staged[0].errors.length,0);assert.equal(staged[0].rowCount,26);
  assert.equal(await db.bankTransaction.count(),0,"Upload only stages; no transactions until confirmation");
  const first=await processFundImport({batchId:staged[0].id,replaceLegacy:false,acceptMismatch:false},"test");assert.equal(first.cursor,20);
  const parallel=await Promise.all([finish(staged[0].id),finish(staged[0].id)]);assert.ok(parallel.every(r=>r.status==="COMPLETE"));
  assert.equal(await db.bankTransaction.count(),26);assert.equal(parallel[0].review,0,"Different rows in same file are not false duplicates");
  const repeated=await stageFundImport(fund.id,upload,"test");assert.equal(repeated[0].id,staged[0].id);await finish(repeated[0].id);assert.equal(await db.bankTransaction.count(),26);
  await finish(staged[1].id);assert.ok((await db.fund.findUniqueOrThrow({where:{id:fund.id}})).accountIds.includes(b.id));
  const totals=await fundTotals();assert.equal(totals.find(f=>f.id===fund.id)?.balance,29800n);
  const accounts=await accountTotals();assert.equal(accounts.find(x=>x.id===a.id)?.expected,24800n);assert.equal(accounts.find(x=>x.id===b.id)?.expected,5000n);
  const source=(id:string,narrative:string,amount:number,time="10:00")=>({id,bankAccountId:"2028140453689352192",refId:`REF-${id}`,transactionAmount:amount,type:"CREDIT" as const,narrative,transactionTime:`${today}T${time}:00`});
  const annotatedExcel=await db.bankTransaction.findFirstOrThrow({where:{origin:"EXCEL",entryStatus:"POSTED",narrative:"TPOLD donor 0"}});
  await db.transactionNote.create({data:{requestId:randomUUID(),transactionId:annotatedExcel.id,text:"Keep note after automatic bank matching",actor:"test"}});
  await serializable(tx=>ingestBankPage(tx,a.id,[source("bank-strong","TPOLD donor 0",1000)],"test"));
  const annotatedBank=await db.bankTransaction.findUniqueOrThrow({where:{accountId_sourceId:{accountId:a.id,sourceId:"bank-strong"}}});
  assert.equal(await db.transactionNote.count({where:{transactionId:annotatedBank.id,text:"Keep note after automatic bank matching"}}),1);

  assert.equal((await accountTotals()).find(x=>x.id===a.id)?.expected,24800n,"Excel then bank must count once");
  assert.equal(await db.bankTransaction.count({where:{entryStatus:"MERGED"}}),1);
  await serializable(tx=>ingestBankPage(tx,a.id,[source("bank-uncertain","changed narrative",1000,"10:01")],"test"));
  const uncertain=await db.bankTransaction.findUniqueOrThrow({where:{accountId_sourceId:{accountId:a.id,sourceId:"bank-uncertain"}}});assert.equal(uncertain.entryStatus,"REVIEW");
  const excel=await db.bankTransaction.findFirstOrThrow({where:{origin:"EXCEL",entryStatus:"POSTED",narrative:"TPOLD donor 1"}});
  await reviewEntry({id:uncertain.id,decision:"MERGE",targetId:excel.id,reason:"Confirmed same imported receipt"},"test");
  assert.equal((await accountTotals()).find(x=>x.id===a.id)?.expected,24800n);
  await serializable(tx=>ingestBankPage(tx,a.id,[source("bank-first","TPTARGET direct bank",2500,"13:00")],"test"));
  const importedBank=await stageFundImport(fund.id,await file([{name:"TK MY",rows:[[1,`${today} 13:00`,"","TPTARGET direct bank","",2500,""]]}]),"test");
  const matched=await finish(importedBank[0].id);assert.equal(matched.matched,1);assert.equal(matched.added,0);
  assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{accountId_sourceId:{accountId:a.id,sourceId:"bank-first"}}})).fundId,fund.id,"Explicit Excel allocations override AUTO assignment");
  const conflict=await stageFundImport(target.id,await file([{name:"TK MY",rows:[[1,`${today} 10:00`,"","TPOLD donor 0","",1000,""]]}]),"test");
  assert.equal((await finish(conflict[0].id)).review,1,"Do not overwrite a manual allocation to another fund");
  const oldExpected=(await accountTotals()).find(x=>x.id===a.id)!.expected;
  const conflictRow=await db.bankTransaction.findFirstOrThrow({where:{importId:conflict[0].id}});
  await reviewEntry({id:conflictRow.id,decision:"SEPARATE",reason:"Independent receipt confirmed"},"test");
  assert.equal((await accountTotals()).find(x=>x.id===a.id)?.expected,oldExpected+1000n);
  await transferFunds({requestId:randomUUID(),accountId:b.id,fromFundId:fund.id,toFundId:target.id,amount:1000n,reason:"Test secondary account transfer"},"test");
  await assert.rejects(transferFunds({requestId:randomUUID(),accountId:b.id,fromFundId:fund.id,toFundId:target.id,amount:5000n,reason:"Cannot spend primary balance in secondary"},"test"),/không đủ/);
  assert.equal((await accountTotals()).find(x=>x.id===b.id)?.expected,5000n);
  const legacy=await db.fund.create({data:{accountId:b.id,code:"TPLEGACY",name:"LEGACY",slug:"test-legacy",keywords:[],openingIncome:999n}});
  const legacyBatch=(await stageFundImport(legacy.id,await file([{name:"TK TRÂM",rows:[[1,`${today} 14:00`,"","Legacy receipt","",999,""]]}]),"test"))[0];
  await assert.rejects(finish(legacyBatch.id),/tổng lịch sử cũ/);await finish(legacyBatch.id,{replaceLegacy:true,acceptMismatch:false});
  assert.equal((await db.fund.findUniqueOrThrow({where:{id:legacy.id}})).openingIncome,0n);
  assert.equal((await accountTotals()).find(x=>x.id===b.id)?.expected,5999n);
  console.log("PASS: real XLSX staging, merged cells, resume/concurrent/re-upload idempotency, multi-account funds, Excel-bank matching in both orders, review holds, manual allocation protection, scoped transfers and legacy summary replacement");
}finally{
 globalThis.fetch=originalFetch;
 if(seeded){await db.auditLog.deleteMany();await db.syncLease.deleteMany();await db.syncRun.deleteMany();await db.transfer.deleteMany();await db.bankTransaction.deleteMany();await db.syncState.deleteMany();await db.fundImport.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();}
 await db.$disconnect();
}
