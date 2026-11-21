// Run only against the local Workers preview with an isolated, migrated QA database.
import assert from 'node:assert/strict';
if(!process.env.DATABASE_URL)throw Error('QA DATABASE_URL required');
const dbUrl=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(dbUrl.hostname)||!dbUrl.pathname.startsWith('/hvntvn_test_worker_'))throw Error('Isolated local Workers QA database required');
const origin=process.env.QA_ORIGIN??'http://localhost:8787';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))throw Error('Local preview only');
const {db}=await import('../src/lib/db');
const id='qa-workers-'+Date.now(),slug=id;
async function json(path:string,options?:RequestInit){const r=await fetch(origin+path,options);const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;}
try{
 const account=await db.bankAccount.create({data:{id,number:id,owner:'QA',label:'QA'}});
 const fund=await db.fund.create({data:{id,accountId:account.id,code:id,name:'Workers QA',slug,keywords:[]}});
 await db.bankTransaction.create({data:{id,accountId:account.id,fundId:fund.id,sourceId:id,refId:'',amount:123456n,direction:'CREDIT',narrative:'Workers cache smoke receipt',displayName:'QA',occurredAt:new Date(),sourceHash:id,source:{qa:true},assignment:'MANUAL'}});
 assert.equal((await fetch(origin+'/login')).status,200);
 assert.equal((await fetch(origin+'/api/admin/funds')).status,401);
 assert.equal((await fetch(origin+'/api/internal/public-cache',{method:'POST'})).status,401);
 const logo=await fetch(origin+'/branding/hoc-vien-nguyen-thuy-viet-nam.png');assert.equal(logo.status,200);assert.ok((await logo.arrayBuffer()).byteLength>100);
 for(let i=0;i<3;i++){const data=await json(`/api/public/funds/${slug}`);assert.equal(data.balance,'123456');assert.equal(data.rows[0].amount,'123456');}
 const searched=await json(`/api/public/funds/${slug}?q=smoke`);assert.equal(searched.rows.length,1);
 console.log('Workers login, auth guards, assets, repeated PostgreSQL requests and public search passed');
 const secret=process.env.QA_SYNC_SECRET;if(secret){await db.bankTransaction.update({where:{id},data:{amount:234567n}});await db.publicCacheRefresh.upsert({where:{fundId:id},create:{fundId:id},update:{requestedVersion:{increment:1}}});const result=await json('/api/internal/public-cache',{method:'POST',headers:{authorization:`Bearer ${secret}`}});console.log('Cache refresh',JSON.stringify(result));const updated=await json(`/api/public/funds/${slug}?q=smoke`);assert.equal(updated.balance,'234567');assert.equal(updated.rows[0].amount,'234567');console.log('Updated financial snapshot and tag invalidation verified');}
}finally{
 await db.$transaction(async tx=>{await tx.bankTransaction.deleteMany({where:{accountId:id}});await tx.publicCacheRefresh.deleteMany({where:{fundId:id}});await tx.fund.deleteMany({where:{id}});await tx.bankAccount.deleteMany({where:{id}})});
 await db.$disconnect();
}
