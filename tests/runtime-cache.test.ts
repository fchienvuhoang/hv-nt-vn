import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('Workers cache preserves values across store instances, expiry, namespaces and deletion',async()=>{
 let now=1000;
 const objects=new Map<string,string>();
 const namespace={idFromName:(name:string)=>name,get:(id:string,opts:{locationHint:string})=>{
  assert.equal(opts.locationHint,'apac-se');
  return {
   getValue:async(key:string)=>{const e=objects.get(id+key);if(!e)return null;const entry=JSON.parse(e);return entry.expiresAt!==null&&entry.expiresAt<=now?null:entry.value},
   setValue:async(key:string,value:unknown,ttl?:number)=>{objects.set(id+key,JSON.stringify({value,expiresAt:ttl===undefined?null:now+ttl*1000}))},
   deleteValue:async(key:string)=>{objects.delete(id+key)},
  };
 }};
 const exports={} as typeof import('../src/lib/runtime-cache');
 vm.runInNewContext(ts.transpile(readFileSync('src/lib/runtime-cache.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports,Date:{now:()=>now},encodeURIComponent,require:(id:string)=>{
  if(id==='server-only')return {};
  if(id==='./cloudflare-context')return {cloudflareContext:()=>({env:{APP_RUNTIME_CACHE:namespace}})};
  if(id==='@vercel/functions')return {getCache:()=>{throw Error('Workers must not fall back to process-local Vercel cache')}};
  throw Error(id);
 }});
 const first=exports.getCache({namespace:'snapshots'}),other=exports.getCache({namespace:'events'});
 await first.set('manifest',{chunks:['a','b']},{ttl:2});
 assert.deepEqual(await exports.getCache({namespace:'snapshots'}).get('manifest'),{chunks:['a','b']});
 assert.equal(await other.get('manifest'),null);
 now=3000;assert.equal(await first.get('manifest'),null);
 await first.set('revision:fund',12);assert.equal(await first.get('revision:fund'),12);
 await first.delete('revision:fund');assert.equal(await first.get('revision:fund'),null);
});

test('Node and Vercel continue to use the original cache provider',async()=>{
 const original={get:async()=>null,set:async()=>{},delete:async()=>{}};
 const exports={} as typeof import('../src/lib/runtime-cache');
 vm.runInNewContext(ts.transpile(readFileSync('src/lib/runtime-cache.ts','utf8'),{module:ts.ModuleKind.CommonJS}),{exports,require:(id:string)=>id==='server-only'?{}:id==='./cloudflare-context'?{cloudflareContext:()=>undefined}:{getCache:()=>original}});
 assert.equal(exports.getCache({namespace:'test'}),original);
});
