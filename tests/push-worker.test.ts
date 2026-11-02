import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
async function click(url:string,workerOrigin:string){
 const handlers:Record<string,(event:unknown)=>void>={};let opened="";let pending:Promise<unknown>|undefined;
 runInNewContext(readFileSync("public/sw.js","utf8"),{URL,self:{location:{origin:workerOrigin},addEventListener:(name:string,fn:(event:unknown)=>void)=>{handlers[name]=fn;},clients:{matchAll:async()=>[],openWindow:async(value:string)=>{opened=value;}}}});
 handlers.notificationclick({notification:{data:{url},close(){}},waitUntil(p:Promise<unknown>){pending=p;}});await pending;return opened;
}
test("push click always opens canonical domain, including installed legacy workers",async()=>{
 for(const origin of ["https://hvntvn.danasangha.org","https://hocviennguyenthuy-vietnam.vercel.app"]){
  for(const target of ["/admin?view=sync","https://hocviennguyenthuy-vietnam.vercel.app/admin?view=sync","https://hvntvn.danasangha.org/admin?view=sync"]){
   assert.equal(await click(target,origin),"https://hvntvn.danasangha.org/admin?view=sync");
  }
 }
});
test("push clicks cannot open arbitrary domains or non-admin pages",async()=>{
 for(const target of ["https://evil.example/admin","javascript:alert(1)","/api/admin/push","//evil.example/admin"]){assert.equal(await click(target,"https://hvntvn.danasangha.org"),"");}
});
