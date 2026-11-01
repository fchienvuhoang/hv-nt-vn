import assert from 'node:assert/strict';
import {test} from 'node:test';
import {allowedBankSyncTime,effectiveSyncStart,BANK_SYNC_MIN_ISO} from '../src/lib/sync-boundary';
import {fetchSourcePage} from '../src/lib/source';
test('fixed Vietnam boundary is inclusive and cannot be configured earlier',()=>{
 assert.equal(allowedBankSyncTime('2026-10-31T23:59:59+07:00'),false);
 assert.equal(allowedBankSyncTime('2026-11-01T00:00:00+07:00'),true);
 assert.equal(allowedBankSyncTime('2026-10-31T17:00:00Z'),true);
 assert.equal(effectiveSyncStart(new Date('2025-01-01')).toISOString(),BANK_SYNC_MIN_ISO);
 assert.equal(effectiveSyncStart().toISOString(),BANK_SYNC_MIN_ISO);
 assert.equal(effectiveSyncStart(new Date('2026-11-02T00:00:00+07:00')).toISOString(),'2026-11-01T17:00:00.000Z');
});
test('source never requests historical dates and rejects historical records',async()=>{
 const original=globalThis.fetch;const calls:URL[]=[];
 globalThis.fetch=async input=>{calls.push(new URL(String(input)));return Response.json({status:200,data:{total:2,page:1,items:['2026-10-31T23:59:59+07:00','2026-11-01T00:00:00+07:00'].map((transactionTime,i)=>({id:String(i),bankAccountId:'2028140453689352192',transactionAmount:100,type:'CREDIT',transactionTime}))}})};
 try{
  assert.equal((await fetchSourcePage('0572','CREDIT','2025-01-01','2026-10-31',1)).items.length,0);assert.equal(calls.length,0);
  const result=await fetchSourcePage('0572','CREDIT','2025-01-01','2026-11-01',1);assert.equal(calls[0].searchParams.get('fromDate'),'2026-11-01');assert.deepEqual(result.items.map(i=>i.id),['1']);
  await assert.rejects(fetchSourcePage('0572','CREDIT','2025-01-01','2026-11-01',2),/đặt lại trang/);assert.equal(calls.length,1);
 }finally{globalThis.fetch=original}
});
