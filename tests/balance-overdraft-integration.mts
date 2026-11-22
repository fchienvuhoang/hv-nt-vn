import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const url=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/hvntvn_test'))throw Error('Isolated local test DB required');
const {db}=await import('../src/lib/db');
const {fundTotals,accountTotals}=await import('../src/lib/ledger');
const {previewBalanceTransfer,commitBalanceTransfer}=await import('../src/lib/balance-transfers');
const {reverseFundTransfer}=await import('../src/lib/transfers');
if(await db.bankAccount.count())throw Error('Empty test DB required');
try{
 const account=await db.bankAccount.create({data:{number:'0572',owner:'QA',label:'QA'}});
 const source=await db.fund.create({data:{accountId:account.id,code:'QA-FROM',slug:'qa-from',name:'QA from',openingExpense:100n,keywords:[]}});
 const destination=await db.fund.create({data:{accountId:account.id,code:'QA-TO',slug:'qa-to',name:'QA to',openingExpense:20n,keywords:[]}});
 const balances=async()=>JSON.stringify((await accountTotals()).map(a=>[a.id,a.expected.toString()]));
 const before=await balances();
 const input={fromFundId:source.id,toFundId:destination.id,accountId:account.id,mode:'AMOUNT' as const,value:'50',reason:'QA negative source transfer'};
 const preview=await previewBalanceTransfer(input);
 assert.equal(preview.sourceBalanceBefore,'-100');assert.equal(preview.sourceBalanceAfter,'-150');
 assert.equal(preview.destinationBalanceAfter,'30');
 const request={...input,requestId:randomUUID(),fingerprint:preview.fingerprint};
 const saved=await commitBalanceTransfer(request,'qa');
 assert.equal((await commitBalanceTransfer(request,'qa')).id,saved.id);
 assert.equal((await fundTotals(db,source.id))[0].balance,-150n);
 assert.equal(await balances(),before,'each bank account total must remain unchanged');
 await reverseFundTransfer(saved.id,'QA reverse overdraft transfer','qa');
 assert.equal((await fundTotals(db,destination.id))[0].balance,-20n,'reversal may restore a negative balance');
 assert.equal((await fundTotals(db,source.id))[0].balance,-100n);
 assert.equal(await balances(),before);
 const zero=await db.fund.create({data:{accountId:account.id,code:'QA-ZERO',slug:'qa-zero',name:'QA zero',keywords:[]}});
 const zeroInput={...input,fromFundId:zero.id,value:'10'};
 const zeroPreview=await previewBalanceTransfer(zeroInput);
 await commitBalanceTransfer({...zeroInput,requestId:randomUUID(),fingerprint:zeroPreview.fingerprint},'qa');
 assert.equal((await fundTotals(db,zero.id))[0].balance,-10n);
 assert.equal(await balances(),before);
 await assert.rejects(db.$transaction(async tx=>{
  const invalid=await tx.transfer.create({data:{requestId:randomUUID(),fromFundId:source.id,toFundId:destination.id,amount:1n,reason:'QA allocation guard',mode:'ALLOCATION',actor:'qa'}});
  await tx.transferBalanceItem.create({data:{transferId:invalid.id,accountId:account.id,accountNumber:'0572',amount:1n,sourceBefore:0n,sourceAfter:-1n,destinationBefore:0n,destinationAfter:1n}});
 }),'database must still reject negative receipt-allocation balances');
 assert.equal(await db.bankTransaction.count(),0);assert.equal(await db.fundAllocation.count(),0);
 console.log('PASS: negative/zero source, exact bank totals, idempotency, reversal into deficit and database allocation guard');
}finally{
 await db.auditLog.deleteMany();await db.transfer.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();await db.$disconnect();
}
