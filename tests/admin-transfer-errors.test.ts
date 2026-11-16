import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {z} from 'zod';

function route(error:Error,authorized=true){
 const dependencies:Record<string,unknown>={
  'next/server':{NextResponse:{json:(data:unknown,init:ResponseInit)=>Response.json(data,init)},after:()=>{}},
  zod:{z},'@/auth':{auth:async()=>authorized?{user:{email:'admin@example.com'}}:null,allowedAdmin:()=>true},
  '@/lib/admin-codec':{encodeAdmin:(value:unknown)=>value},
  '@/lib/operation-metrics':{measureOperations:async(_flow:string,work:()=>Promise<unknown>)=>work()},
  '@/lib/admin-mutation-scope':{mutationScope:{run:async(_scope:unknown,work:()=>Promise<unknown>)=>work()}},
  '@/lib/balance-transfers':{previewBalanceTransfer:async()=>{throw error}},
  '@/lib/allocation-transfers':{isAllocationTransferError:(value:Error)=>value.name==='AllocationTransferError'},
 };
 const api={} as {POST:(request:unknown,context:unknown)=>Promise<Response>};
 vm.runInNewContext(ts.transpile(readFileSync('src/app/api/admin/[...resource]/route.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports:api,require:(name:string)=>dependencies[name]??{},console:{error:()=>{}}});
 const request={method:'POST',headers:new Headers({origin:'https://example.com'}),nextUrl:new URL('https://example.com/api/admin/transfers/preview'),json:async()=>({})};
 return ()=>api.POST(request,{params:Promise.resolve({resource:['transfers','preview']})});
}
test('async preview business error is caught inside scoped request and returns JSON 400',async()=>{
 const error=new Error('Không đủ số dư khả dụng');error.name='AllocationTransferError';
 const response=await route(error)();assert.equal(response.status,400);assert.match(response.headers.get('content-type')??'',/application\/json/);
 assert.deepEqual(await response.json(),{error:'Không đủ số dư khả dụng'});
});
test('async database preview error returns safe JSON 500 without exposing details',async()=>{
 const response=await route(new Error('private database details'))();assert.equal(response.status,500);
 assert.deepEqual(await response.json(),{error:'Không thể xử lý dữ liệu. Vui lòng thử lại.'});
});
test('preview continues to reject anonymous requests',async()=>{
 const response=await route(new Error('unused'),false)();assert.equal(response.status,401);
});
