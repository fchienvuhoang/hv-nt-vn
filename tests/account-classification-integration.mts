import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(!["localhost","127.0.0.1"].includes(url.hostname)||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Require isolated localhost hvntvn_test database");
const {db}=await import("../src/lib/db");
const {ingestBankPage}=await import("../src/lib/ingest-bank");
const {reassignTransactions}=await import("../src/lib/transaction-management");
if(await db.bankAccount.count())throw new Error("Require empty test database");
try{
 const my=await db.bankAccount.create({data:{number:"0572",owner:"TEST",label:"Mỹ"}});
 const tram=await db.bankAccount.create({data:{number:"0856",owner:"TEST",label:"Trâm"}});
 const httb=await db.fund.create({data:{accountId:my.id,code:"HTTB",name:"HTTB",slug:"httb",keywords:["TAM BAO"]}});
 const pscd=await db.fund.create({data:{accountId:tram.id,code:"PSCD",name:"PSCD",slug:"pscd",keywords:[]}});
 const shared=await db.fund.create({data:{accountId:my.id,accountIds:[tram.id],code:"TP112",name:"Shared",slug:"shared",keywords:[]}});
 const item=(id:string,narrative:string)=>({id,bankAccountId:"TEST",transactionAmount:100000,type:"CREDIT" as const,narrative,transactionTime:"2026-11-01T09:00:00"});
 await db.$transaction(tx=>ingestBankPage(tx,tram.id,[item("wrong-code","HTTB TP112"),item("wrong-alias","TAM BAO"),item("right","PSCD")],"qa"));
 await db.$transaction(tx=>ingestBankPage(tx,my.id,[item("reverse-wrong","PSCD"),item("my-right","HTTB")],"qa"));
 for(const sourceId of ["wrong-code","wrong-alias","reverse-wrong"]){
  const row=await db.bankTransaction.findFirstOrThrow({where:{sourceId}});
  assert.equal(row.fundId,null);assert.equal(row.assignment,"UNASSIGNED");assert.equal(row.entryStatus,"POSTED");assert.match(row.matchReason,/^Sai tài khoản nhận:/);
 }
 assert.equal((await db.bankTransaction.findFirstOrThrow({where:{sourceId:"right"}})).fundId,pscd.id);
 assert.equal((await db.bankTransaction.findFirstOrThrow({where:{sourceId:"my-right"}})).fundId,httb.id);
 const wrong=await db.bankTransaction.findFirstOrThrow({where:{sourceId:"wrong-code"}});
 const request={requestId:randomUUID(),sourceFundId:null,targetFundId:httb.id,reason:"Kiểm tra tài khoản nhận",rows:[{id:wrong.id,updatedAt:wrong.updatedAt.toISOString()}]};
 await assert.rejects(reassignTransactions(request,"qa"),/tài khoản/);
 assert.equal((await db.bankTransaction.findUniqueOrThrow({where:{id:wrong.id}})).fundId,null);
 await assert.rejects(reassignTransactions({...request,requestId:randomUUID(),targetFundId:shared.id},"qa"),/đúng 1 tài khoản/);
 await reassignTransactions({...request,requestId:randomUUID(),targetFundId:pscd.id},"qa");
 const moved=await db.bankTransaction.findUniqueOrThrow({where:{id:wrong.id}});
 assert.equal(moved.accountId,tram.id);assert.equal(moved.amount,wrong.amount);assert.equal(moved.fundId,pscd.id);assert.equal(moved.assignment,"MANUAL");
 // Closed funds reject new automatic receipts AND expenses, by code and alias.
 const {fundMembership}=await import("../src/lib/allocation");
 for(const status of ["PAUSED","COMPLETED"] as const){
  await db.fund.update({where:{id:httb.id},data:{status}});
  const incoming=[...(["CREDIT","DEBIT"] as const)].flatMap(type=>["HTTB","TAM BAO"].map((narrative,index)=>({...item(`inactive-${status}-${type}-${index}`,narrative),type})));
  await db.$transaction(tx=>ingestBankPage(tx,my.id,incoming,"qa"));
  for(const source of incoming){const row=await db.bankTransaction.findUniqueOrThrow({where:{accountId_sourceId:{accountId:my.id,sourceId:source.id}}});assert.equal(row.fundId,null);assert.equal(row.assignment,"UNASSIGNED");assert.equal(row.entryStatus,"POSTED");assert.match(row.matchReason,/tạm dừng hoặc hoàn thành/)}
  assert.equal(await db.bankTransaction.count({where:{AND:[fundMembership(null)],sourceId:{in:incoming.map(i=>i.id)}}}),4,"all new closed-fund receipts/expenses appear in Unclassified");
 }
 assert.equal((await db.bankTransaction.findFirstOrThrow({where:{sourceId:"my-right"}})).fundId,httb.id,"closing a fund must not detach historical gifts");
 console.log("PASS: wrong-account code/alias detection during ingest; no alias/code fallback; correct-account auto assignment; cross-account manual rejection; valid manual assignment preserves receiving account and amount; paused/completed code and alias route new credits/debits to Unclassified, historical gifts remain");
}finally{await db.auditLog.deleteMany();await db.bankTransaction.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();await db.$disconnect();}
