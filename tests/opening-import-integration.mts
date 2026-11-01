import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
const url=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid');
if(url.hostname!=='localhost'||!url.pathname.startsWith('/hvntvn_test'))throw new Error('Isolated QA DB only');
const {db}=await import('../src/lib/db');const {stageFundImport,processFundImport}=await import('../src/lib/fund-imports');const {fundTotals,accountTotals}=await import('../src/lib/ledger');const {transactionSummary}=await import('../src/lib/transaction-summary');const {transactionWhere}=await import('../src/lib/transaction-navigation-data');
if(await db.bankAccount.count())throw new Error('Empty QA DB required');
const actor={id:'qa-import',name:'QA Import',email:'qa@example.test'};
async function file(month=11,carry=14885773){const book=new ExcelJS.Workbook();for(const [name,amount]of [[`THÁNG ${month}.2026 - TK TRÂM`,carry],[`THÁNG ${month}.2026 - TK MY`,14365000]] as const){const sheet=book.addWorksheet(name);sheet.addRow(['BÁT CƠM THIỆN PHÁP']);sheet.addRow(['STT','Thời gian','Chủ tài khoản','Nội dung','Tiền ra','Tiền vào']);sheet.addRow(['','','','','',amount]);sheet.addRow(['','','','Điều chuyển số dư từ tháng trước sang','',amount]);}return new File([new Uint8Array(await book.xlsx.writeBuffer())],'carry.xlsx')}
try{
 const [a,b]=await Promise.all(['0572','0856'].map(number=>db.bankAccount.create({data:{number,owner:'TEST',label:'TEST'}})));const fund=await db.fund.create({data:{accountId:a.id,accountIds:[b.id],code:'BATCOM',name:'TEST',slug:'qa-opening',keywords:[]}});
 const upload=await file(),batches=await stageFundImport(fund.id,upload,actor,{latestMonthOnly:true});assert.equal(batches.length,2);
 for(const batch of batches){assert.equal(batch.errors.length,0);assert.equal(batch.rowCount,1);assert.equal(batch.income,'0');assert.notEqual(batch.openingBalance,'0');const done=await processFundImport({batchId:batch.id,replaceLegacy:false,acceptMismatch:false},actor);assert.equal(done.status,'COMPLETE');await processFundImport({batchId:batch.id,replaceLegacy:false,acceptMismatch:false},actor)}
 assert.equal(await db.bankTransaction.count(),2);assert.equal(await db.bankTransaction.count({where:transactionWhere({from:'',to:'',account:'',q:'',type:'',review:''})}),2);
 let total=(await fundTotals())[0];assert.equal(total.openingBalance,29250773n);assert.equal(total.balance,29250773n);assert.equal(total.income,0n);assert.equal(total.expense,0n);assert.equal(total.count,0);assert.equal(total.incomeCount,0);assert.equal(total.statementCount,2);assert.equal(total.statementIncomeCount,2);assert.equal(total.byAccount.find(x=>x.accountId===a.id)?.openingBalance,14365000n);assert.equal(total.byAccount.find(x=>x.accountId===b.id)?.openingBalance,14885773n);
 assert.deepEqual((await accountTotals()).map(x=>[x.number,x.expected,x.income]),[['0572',14365000n,0n],['0856',14885773n,0n]]);
 assert.ok((await transactionSummary(new Date('2026-11-01T10:00:00Z'))).days.every(d=>d.incomeCount===0&&d.expenseCount===0&&d.income===0n&&d.expense===0n));
 const notes=await db.auditLog.findMany({where:{action:'FUND_OPENING_BALANCE_IMPORTED'}});assert.equal(notes.length,2);assert.ok(notes.every(n=>n.actorId===actor.id));
 const again=await stageFundImport(fund.id,upload,actor,{latestMonthOnly:true});assert.deepEqual(again.map(x=>x.id),batches.map(x=>x.id));
 const nextMonth=await stageFundImport(fund.id,await file(12),actor,{latestMonthOnly:true});await assert.rejects(processFundImport({batchId:nextMonth[0].id,replaceLegacy:false,acceptMismatch:false},actor),/đã có số dư/);
 const changed=await stageFundImport(fund.id,await file(11,12345),actor,{latestMonthOnly:true});await assert.rejects(processFundImport({batchId:changed[0].id,replaceLegacy:false,acceptMismatch:false},actor),/đã có số dư/);
 const income=await db.bankTransaction.create({data:{accountId:a.id,fundId:fund.id,sourceId:'NEW',refId:'NEW',direction:'CREDIT',amount:1000n,narrative:'New gift',displayName:'TEST',occurredAt:new Date('2026-11-01T10:00:00Z'),sourceHash:'TEST',source:{test:true}}});
 await db.bankTransaction.create({data:{accountId:b.id,fundId:fund.id,sourceId:'EXPENSE',refId:'EXPENSE',direction:'DEBIT',amount:500n,narrative:'Expense',displayName:'TEST',occurredAt:income.occurredAt,sourceHash:'TEST',source:{test:true}}});
 total=(await fundTotals())[0];assert.equal(total.balance,29251273n);assert.equal(total.income,1000n);assert.equal(total.expense,500n);assert.equal(total.count,2);assert.equal(total.incomeCount,1);assert.equal(total.expenseCount,1);
 assert.equal(await db.bankTransaction.count({where:transactionWhere({from:'',to:'',account:'',q:'',type:'',review:''})}),4);
 console.log('PASS: latest-month opening imports, correct per-account balances, visible opening statement rows without fabricated daily receipts, audit identity, source total reconciliation, repeat idempotency, reject duplicate monthly balances, subsequent income/expense arithmetic');
}finally{await db.auditLog.deleteMany();await db.bankTransaction.deleteMany();await db.fundImport.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();await db.$disconnect()}
