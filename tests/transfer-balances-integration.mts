import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(url.hostname!=="localhost"||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Isolated test database only");
const {db}=await import("../src/lib/db");
const {previewAllocationTransfer,commitAllocationTransfer}=await import("../src/lib/allocation-transfers");
const {reverseFundTransfer}=await import("../src/lib/transfers");
const {fundTransactionList}=await import("../src/lib/transaction-management");
const {fundTotals,accountTotals}=await import("../src/lib/ledger");
if(await db.bankAccount.count())throw new Error("Require empty test database");
const actor={id:"qa-balance",name:"QA",email:"qa@example.test"};
try{
 const accounts=await Promise.all(["0572","0856"].map(number=>db.bankAccount.create({data:{number,owner:"TEST",label:"TEST"}})));
 const funds=await Promise.all(["SOURCE","DEST"].map(code=>db.fund.create({data:{code,slug:`test-${code}`,name:code,keywords:[],accountId:accounts[0].id,accountIds:[accounts[1].id]}})));
 const batch=await db.fundImport.create({data:{fundId:funds[0].id,fileName:"TEST",fileHash:randomUUID(),sheetName:"TEST",actor:"QA",rowCount:2,income:9625727n,expense:0n,sample:[],errors:[],data:[]}});
 const make=(sourceId:string,account:number,amount:bigint,entryStatus:string,direction:"CREDIT"|"DEBIT"="CREDIT",fundId=funds[0].id)=>db.bankTransaction.create({data:{accountId:accounts[account].id,fundId,sourceId,refId:sourceId,amount,entryStatus,direction,...(entryStatus==="OPENING"?{origin:"EXCEL",assignment:"MANUAL",importId:batch.id}:{}),narrative:"TEST",displayName:"TEST",occurredAt:new Date(),sourceHash:"TEST",source:{test:true}}});
 await make("OPEN-A",0,8061727n,"OPENING");await make("OPEN-B",1,1564000n,"OPENING");await make("CREDIT",0,725000n,"POSTED");
 const input={fromFundId:funds[0].id,toFundId:funds[1].id,mode:"AMOUNT" as const,value:"10000000",reason:"Điều chuyển số dư kiểm thử"};
 const bankBefore=await db.bankTransaction.findMany({orderBy:{id:"asc"}});
 const bankBalances=JSON.stringify((await accountTotals()).map(a=>({id:a.id,balance:a.expected.toString()})));
 const totals=()=>fundTotals();
 const preview=await previewAllocationTransfer(input);
 assert.equal(preview.sourceBalanceBefore,"10350727");assert.equal(preview.sourceBalanceAfter,"350727");assert.equal(preview.destinationBalanceAfter,"10000000");
 assert.equal(preview.items.reduce((n,i)=>n+BigInt(i.amount),0n),725000n);
 assert.equal(preview.balanceItems.reduce((n,i)=>n+BigInt(i.amount),0n),9275000n);
 assert.equal(await db.transfer.count(),0);assert.equal(await db.transferBalanceItem.count(),0);
 const request={...input,requestId:randomUUID(),fingerprint:preview.fingerprint};
 const expense=await make("LATE-EXPENSE",0,400000n,"POSTED","DEBIT");
 await assert.rejects(commitAllocationTransfer(request,actor),/Không đủ/);assert.equal(await db.transfer.count(),0);await db.bankTransaction.delete({where:{id:expense.id}});
 const [transfer,duplicate]=await Promise.all([commitAllocationTransfer(request,actor),commitAllocationTransfer(request,actor)]);assert.equal(transfer.id,duplicate.id);
 let state=await totals();assert.equal(state.find(f=>f.id===funds[0].id)!.balance,350727n);assert.equal(state.find(f=>f.id===funds[1].id)!.balance,10000000n);
 const targetAfter=await previewAllocationTransfer({...input,mode:"TARGET_INCOME",value:"300000"});assert.equal(targetAfter.amount,"50727");
 assert.ok(state.find(f=>f.id===funds[0].id)!.byAccount.every(a=>a.balance>=0n));
 assert.equal(state.find(f=>f.id===funds[0].id)!.fundingIncome,350727n);assert.equal(state.find(f=>f.id===funds[1].id)!.fundingIncome,10000000n);
 const received=await fundTransactionList({fundId:funds[1].id});assert.equal(received.fundLedger?.balance,"10000000");assert.equal(received.fundLedger?.fundingIncome,"10000000");assert.equal(received.transfers[0].amount,"10000000");assert.equal(received.transfers[0].balanceAmount,"9275000");assert.equal(received.transfers[0].received,true);assert.equal(received.transfers[0].reason,input.reason);assert.ok(received.rows.every(r=>r.notes.some(n=>n.text.includes("SOURCE sang DEST"))));
 const receivedAccount=await fundTransactionList({fundId:funds[1].id,account:accounts[1].id});assert.equal(receivedAccount.transfers[0].amount,preview.balanceItems.find(i=>i.accountId===accounts[1].id)!.amount);
 const sent=await fundTransactionList({fundId:funds[0].id});assert.equal(sent.transfers[0].received,false);assert.equal(sent.fundLedger?.balance,"350727");
 assert.equal(JSON.stringify((await accountTotals()).map(a=>({id:a.id,balance:a.expected.toString()}))),bankBalances);
 const originalRows=await db.bankTransaction.findMany({orderBy:{id:"asc"}});assert.deepEqual(originalRows.map(r=>({id:r.id,amount:r.amount,accountId:r.accountId,source:r.source})),bankBefore.map(r=>({id:r.id,amount:r.amount,accountId:r.accountId,source:r.source})));
 await reverseFundTransfer(transfer.id,"Đảo kiểm thử số dư",actor);state=await totals();assert.equal(state.find(f=>f.id===funds[0].id)!.balance,10350727n);assert.equal(state.find(f=>f.id===funds[1].id)!.balance,0n);
 // Pure balance: no posted credit left in the chosen second account.
 const pureInput={...input,value:"1564000",accountId:accounts[1].id};const pure=await previewAllocationTransfer(pureInput);assert.equal(pure.items.length,0);assert.equal(pure.balanceItems.length,1);
 const pureTransfer=await commitAllocationTransfer({...pureInput,requestId:randomUUID(),fingerprint:pure.fingerprint},actor);
 assert.equal((await totals()).find(f=>f.id===funds[0].id)!.byAccount.find(a=>a.accountId===accounts[1].id)!.balance,0n);
 await reverseFundTransfer(pureTransfer.id,"Đảo khoản chỉ có số dư",actor);
 // New expense on the recipient prevents reversing money it no longer has.
 const again=await previewAllocationTransfer(pureInput);const againTransfer=await commitAllocationTransfer({...pureInput,requestId:randomUUID(),fingerprint:again.fingerprint},actor);
 const spent=await make("SPENT",1,1n,"POSTED","DEBIT",funds[1].id);await assert.rejects(reverseFundTransfer(againTransfer.id,"Không đủ tiền đảo lại",actor),/không còn đủ/);await db.bankTransaction.delete({where:{id:spent.id}});await reverseFundTransfer(againTransfer.id,"Khôi phục sau kiểm thử",actor);
 // Transferring the entire available amount is valid and leaves zero.
 const allInput={...input,value:"10350727"},all=await previewAllocationTransfer(allInput);const allTransfer=await commitAllocationTransfer({...allInput,requestId:randomUUID(),fingerprint:all.fingerprint},actor);assert.equal((await totals()).find(f=>f.id===funds[0].id)!.balance,0n);await reverseFundTransfer(allTransfer.id,"Khôi phục toàn bộ số dư",actor);
 console.log("PASS: opening + detailed mixed transfer, pure opening balance, both accounts, exact zero, stale expenses, concurrent idempotency, reversal safety, immutable bank money and system totals");
}finally{await db.transfer.deleteMany({where:{reversalOf:{not:null}}});await db.transfer.deleteMany();await db.auditLog.deleteMany();await db.bankTransaction.deleteMany();await db.fundImport.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();await db.$disconnect()}
