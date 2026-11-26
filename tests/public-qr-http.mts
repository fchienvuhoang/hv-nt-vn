import assert from 'node:assert/strict';
import {encode} from 'next-auth/jwt';
const database=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid');
const origin=process.env.QA_ORIGIN??'http://localhost:3002';
if(!['localhost','127.0.0.1'].includes(database.hostname)||!database.pathname.startsWith('/hvntvn_test')||!/^http:\/\/localhost:\d+$/.test(origin))throw Error('Isolated local QA only');
if(!process.env.AUTH_SECRET)throw Error('Test AUTH_SECRET required');
const {db}=await import('../src/lib/db');
if(await db.bankAccount.count())throw Error('Empty QA database required');
const cookie='authjs.session-token='+await encode({token:{email:'qa-admin@example.test',sub:'qa',name:'QA'},secret:process.env.AUTH_SECRET,salt:'authjs.session-token',maxAge:300});
try{
 for(const number of ['0572','0856'])await db.bankAccount.create({data:{number,owner:'QA',label:'QA'}});
 const save=async(qr:string|undefined,id?:string)=>{
  const form=new FormData();for(const [key,value] of Object.entries({code:'QAQRTEST',name:'QA - QR TEST',description:'',keywords:'',status:'ACTIVE',...(id?{id}:{}),...(qr===undefined?{}:{publicQrAccount:qr})}))form.set(key,value);
  const response=await fetch(origin+'/api/admin/funds',{method:id?'PUT':'POST',headers:{cookie,origin},body:form});
  assert.equal(response.status,200);return response.json();
 };
 assert.ok((await save('0856')).success);
 const fund=await db.fund.findUniqueOrThrow({where:{code:'QAQRTEST'}}),primary=fund.accountId;
 const read=async()=>{const response=await fetch(origin+'/api/public/funds/'+fund.slug);assert.equal(response.status,200);return response.json()};
 assert.equal((await read()).publicQrAccount,'0856');
 assert.ok((await save('0572',fund.id)).success);assert.equal((await read()).publicQrAccount,'0572');
 assert.ok((await save(undefined,fund.id)).success);assert.equal((await read()).publicQrAccount,'0572','older clients must preserve the configured QR');
 const invalid=await save('9999',fund.id);assert.ok(invalid.fieldErrors?.publicQrAccount);assert.equal((await read()).publicQrAccount,'0572');
 assert.ok((await save('',fund.id)).success);assert.equal((await read()).publicQrAccount,null);
 assert.equal((await db.fund.findUniqueOrThrow({where:{id:fund.id}})).accountId,primary);
 assert.equal(await db.bankTransaction.count(),0);assert.equal(await db.transfer.count(),0);
 assert.ok((await db.auditLog.findMany({where:{entityId:fund.id}})).some(row=>JSON.stringify(row.details).includes('publicQrAccount')));
 console.log('PASS: create/edit QR, public cache invalidation, hide QR, reject unknown accounts, preserve older clients and leave financial records unchanged');
}finally{await db.$disconnect();}
