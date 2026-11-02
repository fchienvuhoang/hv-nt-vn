import assert from 'node:assert/strict';
const u=new URL(process.env.DATABASE_URL!);if(u.hostname!=='localhost'||!u.pathname.startsWith('/hvntvn_test'))throw Error('Test DB required');
const {db}=await import('../src/lib/db');
const {fundTotals}=await import('../src/lib/ledger');
const a=await db.bankAccount.create({data:{number:'MONTH-QA',owner:'QA',label:'QA'}});
const f=await db.fund.create({data:{accountId:a.id,code:'MONTHQA',name:'QA monthly',slug:'qa-monthly',isLongTerm:true,openingExpense:100n}});
try{
 const add=(id:string,at:string,amount:bigint,direction:'CREDIT'|'DEBIT')=>db.bankTransaction.create({data:{accountId:a.id,fundId:f.id,sourceId:id,refId:id,amount,direction,narrative:id,displayName:'QA',occurredAt:new Date(at),sourceHash:id,source:{}}});
 await add('oct','2026-10-30T00:00:00+07:00',50n,'CREDIT');
 await add('nov','2026-11-01T00:00:00+07:00',200n,'CREDIT');
 await add('nov-exp','2026-11-30T23:59:59+07:00',70n,'DEBIT');
 await add('dec','2026-12-01T00:00:00+07:00',500n,'CREDIT');
 const start=(await fundTotals(db,f.id,new Date('2026-11-01T00:00:00+07:00')))[0];
 const end=(await fundTotals(db,f.id,new Date('2026-12-01T00:00:00+07:00')))[0];
 assert.equal(start.balance,-50n);assert.equal(end.balance,80n);assert.equal(end.income-start.income,200n);assert.equal(end.expense-start.expense,70n);
 const r=await fetch('http://localhost:3010/api/public/funds/qa-monthly?month=2026-11');assert.equal(r.status,200);const data=await r.json();assert.equal(data.carryBalance,'-50');assert.equal(data.balance,'80');assert.equal(data.income,'200');assert.equal(data.count,1);assert.equal(data.rows[0].narrative,'nov');
 const december=await (await fetch('http://localhost:3010/api/public/funds/qa-monthly?month=2026-12')).json();assert.equal(december.month,'2026-11');assert.equal(december.carryBalance,'-50');assert.equal(december.balance,'80');
 const past=await (await fetch('http://localhost:3010/api/public/funds/qa-monthly?month=2026-10')).json();assert.equal(past.month,'2026-11');assert.equal(past.rows[0].narrative,'nov');
 console.log('PASS negative carry, positive carry, Vietnam month boundaries, monthly API rows and totals');
}finally{await db.bankTransaction.deleteMany({where:{accountId:a.id}});await db.fund.delete({where:{id:f.id}});await db.bankAccount.delete({where:{id:a.id}});await db.$disconnect();}
