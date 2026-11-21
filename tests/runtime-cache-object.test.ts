import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('Real Workers SQLite cache persists RPC values, expires entries and isolates objects',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),sourcefile:'runtime-cache-smoke.ts',contents:`
  import {RuntimeCacheObject} from './cloudflare/runtime-cache-object';
  export {RuntimeCacheObject};
  export default {async fetch(request,env){
   const {op,key,value,ttl,object='one'}=await request.json();
   const stub=env.CACHE.get(env.CACHE.idFromName(object));
   if(op==='set'){await stub.setValue(key,value,ttl);return Response.json({ok:true});}
   if(op==='delete'){await stub.deleteValue(key);return Response.json({ok:true});}
   return Response.json({value:await stub.getValue(key)});
  }};`},bundle:true,write:false,format:'esm',platform:'neutral',external:['cloudflare:workers']});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-11-21',durableObjects:{CACHE:{className:'RuntimeCacheObject',useSQLite:true}}}));
 const call=async(body:Record<string,unknown>)=>{const r=await mf.dispatchFetch('https://cache.test',{method:'POST',body:JSON.stringify(body)});assert.equal(r.status,200);return r.json() as Promise<{value:unknown}>;};
 try{
  await call({op:'set',key:'revision',value:1,ttl:60});assert.equal((await call({op:'get',key:'revision'})).value,1);
  await call({op:'set',key:'revision',value:2,ttl:60});assert.equal((await call({op:'get',key:'revision'})).value,2);
  assert.equal((await call({op:'get',key:'revision',object:'other'})).value,null);
  await call({op:'set',key:'snapshot',value:{balance:'9007199254740993',chunks:['one']},ttl:60});
  assert.deepEqual((await call({op:'get',key:'snapshot'})).value,{balance:'9007199254740993',chunks:['one']});
  await call({op:'delete',key:'snapshot'});assert.equal((await call({op:'get',key:'snapshot'})).value,null);
  await call({op:'set',key:'expired',value:5,ttl:-1});assert.equal((await call({op:'get',key:'expired'})).value,null);
 }finally{await mf.dispose();}
});
