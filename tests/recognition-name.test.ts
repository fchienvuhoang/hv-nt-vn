import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {z} from "zod";
import {FundKeywordError} from "../src/lib/fund-keywords";
import {actorStamp} from "../src/lib/actor";
import {originalFundShare} from "../src/lib/transaction-split-input";
function fixture(){
 const fund={id:"fund",recognitionEnabled:true,recognitionAmount:3000000n};
 const entry={amount:3000000n,originalAllocations:null as unknown};
 let authenticated=true,found=true;
 const writes:{table:string;input:unknown}[]=[];
 const tx={fund:{findUniqueOrThrow:async()=>fund},bankTransaction:{findFirst:async()=>found?entry:null},
   fundRecognitionName:{findUnique:async()=>null,upsert:async(input:unknown)=>{writes.push({table:"name",input})}},
   auditLog:{create:async(input:unknown)=>{writes.push({table:"audit",input})}},
 };
 const dependencies:Record<string,unknown>={
  "@/lib/fund-keywords":{FundKeywordError},
  "zod":{z},"@/lib/auth":{requireAdminActor:async()=>{if(!authenticated)throw Error("Unauthorized");return {id:"admin",name:"Admin",email:"admin@example.test"}}},
  "@/lib/ledger":{serializable:async(work:(client:typeof tx)=>Promise<unknown>)=>work(tx)},
  "@/lib/actor":{actorStamp},"next/cache":{revalidatePath:()=>{}},"@/lib/admin-mutation-scope":{invalidateMutation:()=>{}},
  "@/lib/public-original-transactions":{publicOriginalMembership:async()=>({fundId:"fund"})},
  "@/lib/transaction-split-input":{originalFundShare},
 };
 const api={} as typeof import("../src/app/admin/actions");
 vm.runInNewContext(ts.transpile(readFileSync("src/app/admin/actions.ts","utf8"),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports:api,require:(name:string)=>dependencies[name]??{}});
 return {api,writes,entry,fund,setAuthenticated:(value:boolean)=>{authenticated=value},setFound:(value:boolean)=>{found=value}};
}
test("saving a plaque name writes only its separate name record and audit",async()=>{
 const {api,writes,entry}=fixture(),before={...entry};
 const result=await api.saveRecognitionName({fundId:"fund",transactionId:"receipt",name:" Tên gia đình "});
 assert.ok(result.success);assert.deepEqual(writes.map(w=>w.table),["name","audit"]);assert.deepEqual(entry,before);
 const input=JSON.parse(JSON.stringify(writes[0].input));assert.equal(input.create.name,"Tên gia đình");assert.equal(input.create.fundId,"fund");assert.equal(input.create.transactionId,"receipt");
});
test("reject unauthorized, missing, below-threshold and disabled records",async()=>{
 const f=fixture();f.setAuthenticated(false);
 await assert.rejects(f.api.saveRecognitionName({fundId:"fund",transactionId:"receipt",name:"Tên"}),/Unauthorized/);
 f.setAuthenticated(true);f.setFound(false);assert.ok((await f.api.saveRecognitionName({fundId:"fund",transactionId:"receipt",name:"Tên"})).error);
 f.setFound(true);f.entry.originalAllocations=[{fundId:"fund",amount:"2000000"}];assert.ok((await f.api.saveRecognitionName({fundId:"fund",transactionId:"receipt",name:"Tên"})).error);
 f.entry.originalAllocations=null;f.fund.recognitionEnabled=false;assert.ok((await f.api.saveRecognitionName({fundId:"fund",transactionId:"receipt",name:"Tên"})).error);
 assert.equal(f.writes.length,0);
});
test("reject overlong public names and allow clearing an override",async()=>{
 const {api,writes}=fixture();assert.ok((await api.saveRecognitionName({fundId:"fund",transactionId:"receipt",name:"a".repeat(201)})).error);assert.equal(writes.length,0);
 assert.ok((await api.saveRecognitionName({fundId:"fund",transactionId:"receipt",name:""})).success);
});
