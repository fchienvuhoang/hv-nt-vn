import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {decodeAdmin} from '../src/lib/admin-codec';

async function request(status:number,code?:string){
 const redirects:string[]=[];
 const api={} as typeof import('../src/lib/admin-api');
 vm.runInNewContext(ts.transpile(readFileSync('src/lib/admin-api.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{
  exports:api,require:(name:string)=>name==='./admin-codec'?{decodeAdmin}:{},
  window:{location:{assign:(url:string)=>redirects.push(url)}},
  fetch:async()=>Response.json({error:'Request rejected',code},{status}),
 });
 await assert.rejects(api.adminRequest('transactions'),/Request rejected/);
 return redirects;
}
test('a rejected write or unrelated 403 does not log out a valid admin',async()=>{
 assert.deepEqual(await request(403,'INVALID_ORIGIN'),[]);
 assert.deepEqual(await request(403),[]);
});
test('a missing session or explicit revoked admin access still clears the page',async()=>{
 assert.deepEqual(await request(401,'AUTH_REQUIRED'),['/login']);
 assert.deepEqual(await request(403,'ADMIN_FORBIDDEN'),['/login']);
});
