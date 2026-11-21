import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {timingSafeEqual} from 'node:crypto';
import * as tags from '../src/lib/cache-tags';

async function call(result:unknown,failure=false,authorized=true){
 const invalidated:string[]=[];
 const modules:Record<string,unknown>={
  '@/lib/cache-tags':tags,'@/lib/transaction-summary':{TRANSACTION_SUMMARY_TAG:'transaction-summary'},
  'node:crypto':{timingSafeEqual},'next/server':{after:()=>{},NextResponse:{json:Response.json}},
  'next/cache':{revalidateTag:(tag:string)=>invalidated.push(tag)},
  '@/lib/scheduled-sync':{scheduledSync:async()=>{if(failure)throw result;return result}},
  '@/lib/public-snapshot':{queuePublicRefresh:async()=>{}},
 };
 const api={} as typeof import('../src/app/api/sync/transactions/route');
 const secret='test-local-sync-secret-at-least-32-characters';
 vm.runInNewContext(ts.transpile(readFileSync('src/app/api/sync/transactions/route.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports:api,Buffer,console:{error:()=>{}},process:{env:{SYNC_SECRET:secret}},require:(name:string)=>modules[name]??{}});
 const response=await api.POST(new Request('https://example.test/api/sync/transactions',{method:'POST',headers:{authorization:authorized?`Bearer ${secret}`:'wrong'}}));
 return {invalidated,status:response.status};
}
test('unchanged sync updates status caches without dropping transaction caches',async()=>{
 const result=await call({inserted:0,updated:0,affectedFundIds:[],balances:[]});
 assert.equal(result.status,200);
 assert.ok(result.invalidated.includes(tags.ADMIN_SYNC_TAG));
 assert.ok(!result.invalidated.includes(tags.ADMIN_LEDGER_TAG));
});
test('new unassigned transactions and partially committed failures invalidate ledger caches',async()=>{
 for(const failure of [false,true]){
  const result=await call({inserted:1,updated:0,affectedFundIds:[],balances:[]},failure);
  assert.ok(result.invalidated.includes(tags.ADMIN_LEDGER_TAG));
  assert.ok(result.invalidated.includes(tags.ADMIN_SYNC_TAG));
 }
 const unauthorized=await call({},false,false);
 assert.equal(unauthorized.status,401);assert.deepEqual(unauthorized.invalidated,[]);
});
