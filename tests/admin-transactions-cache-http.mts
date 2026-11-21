import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {encode} from 'next-auth/jwt';
import {decodeAdmin} from '../src/lib/admin-codec';
const database=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid');
const origin=process.env.QA_ORIGIN??'http://localhost:8787';
if(!['localhost','127.0.0.1'].includes(database.hostname)||!database.pathname.startsWith('/hvntvn_test_worker_')||!/^http:\/\/localhost:\d+$/.test(origin))throw Error('Isolated local Workers test only');
if(!process.env.AUTH_SECRET)throw Error('Local test AUTH_SECRET required');
const {db}=await import('../src/lib/db');
const cookie='authjs.session-token='+await encode({token:{email:'qa-admin@example.test',sub:'qa',name:'QA'},secret:process.env.AUTH_SECRET,salt:'authjs.session-token',maxAge:300});
const id='qa-cache-'+randomUUID();
try{
 await db.bankAccount.create({data:{id,number:id,owner:'QA',label:'QA'}});
 await db.fund.create({data:{id,accountId:id,slug:id,code:id,name:'QA cache',keywords:[]}});
 await db.bankTransaction.create({data:{id,accountId:id,fundId:id,sourceId:id,refId:'',amount:100000n,direction:'CREDIT',narrative:'QA cache',displayName:'QA',occurredAt:new Date(),sourceHash:id,source:{qa:true}}});
 const path=`/api/admin/transactions?account=${id}`;
 type Data={rows:{id:string;amount:bigint;occurredAt:Date;notes:{text:string}[]}[]};
 const read=async()=>{
  const response=await fetch(origin+path,{headers:{cookie}});
  assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control')??'',/private, no-store/);
  return decodeAdmin<Data>(await response.json());
 };
 assert.equal((await read()).rows[0].amount,100000n);
 // An out-of-band QA-only write demonstrates an actual cached result.
 await db.bankTransaction.update({where:{id},data:{amount:200000n}});
 assert.equal((await read()).rows[0].amount,100000n,'repeat API request must use the cached rows');
 await new Promise(resolve=>setTimeout(resolve,18000));
 assert.equal((await read()).rows[0].amount,100000n,'ledger cache must survive the former 15-second TTL');
 await new Promise(resolve=>setTimeout(resolve,500));
 assert.equal((await read()).rows[0].amount,100000n,'elapsed time must not trigger background revalidation');
 assert.equal((await fetch(origin+path)).status,401,'cached private data still requires authentication');
 const form=new FormData();form.set('requestId',randomUUID());form.set('transactionId',id);form.set('text','QA cache invalidation note');
 const denied=await fetch(origin+'/api/admin/transaction-notes',{method:'POST',headers:{cookie,origin:'https://untrusted.example.test'},body:form});
 assert.equal(denied.status,403);assert.equal((await denied.json()).code,'INVALID_ORIGIN');
 assert.equal((await read()).rows[0].amount,100000n,'rejected writes preserve both session and cache');
 const write=await fetch(origin+'/api/admin/transaction-notes',{method:'POST',headers:{cookie,origin},body:form});
 assert.equal(write.status,200);const result=await write.json();assert.ok(result.success,JSON.stringify(result));
 const changed=await read();assert.equal(changed.rows[0].amount,200000n);
 assert.ok(changed.rows[0].occurredAt instanceof Date);
 assert.ok(changed.rows[0].notes.some(note=>note.text==='QA cache invalidation note'));
 console.log('PASS: Workers admin API cache hit, authentication, private headers, exact amounts/dates and immediate invalidation after REST write');
}finally{
 // The caller stops Workers and drops this disposable DB after background work ends.
 await db.$disconnect();
}
