import assert from 'node:assert/strict';
import {encode} from 'next-auth/jwt';
import {randomUUID} from 'node:crypto';
const u=new URL(process.env.DATABASE_URL??'https://invalid');if(u.hostname!=='localhost'||!u.pathname.startsWith('/hvntvn_test'))throw Error('QA only');
const {db}=await import('../src/lib/db');
const origin='http://localhost:3010',suffix=Date.now(),day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
const a=await db.bankAccount.create({data:{number:`SCOPE-${suffix}`,owner:'QA',label:'QA'}});
const funds=await Promise.all(['a','b'].map(code=>db.fund.create({data:{accountId:a.id,code:`SCOPE${code}${suffix}`,slug:`scope-${code}-${suffix}`,name:'QA',openingIncome:100n}})));
try{
 await db.publicCacheRefresh.createMany({data:funds.map(f=>({fundId:f.id,dailyKey:day,requestedVersion:0,builtVersion:0}))});
 const t=await db.bankTransaction.create({data:{accountId:a.id,fundId:funds[0].id,sourceId:`scope-${suffix}`,refId:`scope-${suffix}`,amount:10n,direction:'CREDIT',narrative:'QA scope',displayName:'QA',source:{},sourceHash:'qa',occurredAt:new Date()}});
 const get=async(i:number)=>{const r=await fetch(`${origin}/api/public/funds/${funds[i].slug}`);assert.equal(r.status,200);return r.json()};
 assert.equal((await get(0)).income,'110');assert.equal((await get(1)).income,'100');
 await db.fund.update({where:{id:funds[1].id},data:{openingIncome:999n}});
 const token=await encode({token:{email:'qa-admin@example.test',sub:'qa'},secret:process.env.AUTH_SECRET!,salt:'authjs.session-token',maxAge:600});
 const form=new FormData();form.set('requestId',randomUUID());form.set('transactionId',t.id);form.set('text','QA fresh note');
 const response=await fetch(origin+'/api/admin/transaction-notes',{method:'POST',headers:{origin,cookie:`authjs.session-token=${token}`},body:form});assert.equal(response.status,200);const saved=await response.json();assert.ok(!saved.error,JSON.stringify(saved));
 const updated=await get(0);assert.equal(updated.rows[0].notes[0].text,'QA fresh note');assert.equal((await get(1)).income,'100','unrelated snapshot must stay warm');
 const states=await db.publicCacheRefresh.findMany({where:{fundId:{in:funds.map(f=>f.id)}}});assert.equal(states.find(s=>s.fundId===funds[0].id)?.requestedVersion,1);assert.equal(states.find(s=>s.fundId===funds[1].id)?.requestedVersion,0);
 console.log('PASS authenticated note updates only affected fund and public HIT keeps unrelated data cached');
}finally{await db.auditLog.deleteMany({where:{entityId:{in:(await db.bankTransaction.findMany({where:{accountId:a.id},select:{id:true}})).map(t=>t.id)}}});await db.bankTransaction.deleteMany({where:{accountId:a.id}});await db.fund.deleteMany({where:{id:{in:funds.map(f=>f.id)}}});await db.bankAccount.delete({where:{id:a.id}});await db.$disconnect();}
