import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
test('Preview revalidation stays internal; production retains the durable queue',async()=>{
 let preview=true;const calls:string[]=[];
 const exports={} as {default:{send:(message:unknown)=>Promise<unknown>}};
 const modules:Record<string,unknown>={
  '@opennextjs/cloudflare':{getCloudflareContext:()=>({env:preview?{HVNTVN_PREVIEW:'1'}:{}})},
  '@opennextjs/cloudflare/overrides/queue/do-queue':{default:{send:async()=>calls.push('production-durable')}},
 };
 vm.runInNewContext(ts.transpile(readFileSync('cloudflare/revalidation-queue.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports,process:{env:{NEXT_PREVIEW_MODE_ID:"qa-token"}},AbortSignal,internalFetch:async(url:string,options:RequestInit)=>{calls.push("preview-internal");assert.equal(url,"https://cf-preview.example.test/test");assert.equal(options.method,"HEAD");assert.equal((options.headers as Record<string,string>)["x-prerender-revalidate"],"qa-token");return {status:200,body:null};},require:(id:string)=>{if(!(id in modules))throw Error(id);return modules[id]}});
 await exports.default.send({MessageBody:{host:"cf-preview.example.test",url:"/test"}});preview=false;await exports.default.send({});
 assert.deepEqual(calls,['preview-internal','production-durable']);
 const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
 assert.notEqual(config.previews.r2_buckets[0].bucket_name,config.r2_buckets[0].bucket_name);
 assert.equal(config.previews.services,undefined);
 for(const binding of config.durable_objects.bindings)assert.ok(config.previews.durable_objects.bindings.some((b:{name:string;class_name:string})=>b.name===binding.name&&b.class_name===binding.class_name));
});
