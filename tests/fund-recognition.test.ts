import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {originalFundShare} from "../src/lib/transaction-split-input";
import {maskPhones} from "../src/lib/domain";
function fixture(){
 const fund={id:"fund",slug:"tp63",code:"TP63",name:"Thiện pháp",recognitionEnabled:true,recognitionTitle:"Cổ phần",recognitionAmount:3000000n};
 const entry=(id:string,amount:bigint)=>({id,amount,originalAllocations:null,occurredAt:new Date("2026-11-12T00:00:00Z"),displayName:"Thí chủ 0912345678",narrative:"TP63 0912345678",hiddenNarrative:false,recognitionNames:[] as {name:string}[]});
 const entries=[entry("one",3000000n),entry("two",6000000n),{...entry("split-small",6000000n),originalAllocations:[{fundId:"fund",amount:"2000000"}]},{...entry("split-equal",6000000n),originalAllocations:[{fundId:"fund",amount:"3000000"}],recognitionNames:[{name:"Tên làm bảng tên"}]}];
 let where:unknown;
 const dependencies:Record<string,unknown>={
  "server-only":{},"next/cache":{unstable_cache:(fn:unknown)=>fn},
  "./db":{db:{fund:{findUnique:async()=>fund},bankTransaction:{findMany:async(input:{where:unknown})=>{where=input.where;return entries}}}},
  "./public-original-transactions":{publicOriginalMembership:async()=>({original:true})},
  "./transaction-split-input":{originalFundShare},"./domain":{maskPhones},"./cache-tags":{publicFundTag:(id:string)=>id},
 };
 const api={} as typeof import("../src/lib/fund-recognition");
 vm.runInNewContext(ts.transpile(readFileSync("src/lib/fund-recognition.ts","utf8"),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports:api,require:(name:string)=>{if(!(name in dependencies))throw Error(name);return dependencies[name]}});
 return {api,fund,entries,getWhere:()=>where};
}
test("recognition lists each qualifying original receipt, preserves split amounts and overrides names",async()=>{
 const {api,getWhere,entries}=fixture(),before=JSON.stringify(entries,(_key,value)=>typeof value==="bigint"?value.toString():value);
 const result=await api.loadRecognition({slug:"tp63"});assert.ok(result);
 assert.equal(result.count,3);assert.equal(result.rows[0].amount,"3000000");assert.equal(result.rows[1].amount,"6000000");
 assert.equal(result.rows[2].name,"Tên làm bảng tên");assert.equal(result.rows[2].amount,"3000000");
 assert.ok(!result.rows[0].name.includes("0912345678"));assert.ok(!result.rows[0].narrative.includes("0912345678"));
 assert.deepEqual(JSON.parse(JSON.stringify(getWhere(),(_key,value)=>typeof value==="bigint"?value.toString():value)),{AND:[{original:true},{direction:"CREDIT",entryStatus:"POSTED",amount:{gte:"3000000"}}]},"only posted receipts, not debit/opening/internal transfers",);
 assert.equal(JSON.stringify(entries,(_key,value)=>typeof value==="bigint"?value.toString():value),before);
});
test("disabled or incomplete configuration does not expose a list",async()=>{
 const {api,fund}=fixture();fund.recognitionEnabled=false;assert.equal(await api.loadRecognition({slug:"tp63"}),null);
 fund.recognitionEnabled=true;fund.recognitionAmount=0n;assert.equal(await api.loadRecognition({slug:"tp63"}),null);
});
test("separate small donations from one name never combine into a qualifying transaction",async()=>{
 const {api,entries}=fixture();entries.splice(0,entries.length,...["a","b"].map(id=>({id,amount:4000000n,originalAllocations:[{fundId:"fund",amount:"2000000"}],occurredAt:new Date(),displayName:"Cùng tên",narrative:"",hiddenNarrative:false,recognitionNames:[]})));
 const result=await api.loadRecognition({slug:"tp63"});assert.ok(result);assert.equal(result.count,0);
});

test("public name falls back to visible narrative for missing or generated donor names",async()=>{
 const {api,entries}=fixture();
 entries[0].displayName="   ";entries[0].narrative="Hùn phước TP63 0912345678";
 entries[1].displayName="Người hùn phước";entries[1].narrative="Nội dung giao dịch";
 let result=await api.loadRecognition({slug:"tp63"});assert.ok(result);
 assert.equal(result.rows[0].name,maskPhones(entries[0].narrative));assert.equal(result.rows[1].name,"Nội dung giao dịch");
 entries[0].hiddenNarrative=true;
 entries[1].displayName="Người ủng hộ ẩn danh";entries[1].recognitionNames=[{name:"Tên đã xác nhận"}];
 result=await api.loadRecognition({slug:"tp63"});assert.ok(result);
 assert.equal(result.rows[0].name,"Nội dung được ẩn theo nguồn sao kê");assert.equal(result.rows[1].name,"Tên đã xác nhận");
});

test("recognition total covers every qualifying page and preserves integer precision",async()=>{
 const {api,entries}=fixture();const base=entries[0];
 entries.splice(0,entries.length,...Array.from({length:105},(_,index)=>({...base,id:`row-${index}`,amount:9007199254740993n})));
 const first=await api.loadRecognition({slug:"tp63"},1),second=await api.loadRecognition({slug:"tp63"},2);
 assert.ok(first);assert.ok(second);assert.equal(first.rows.length,100);assert.equal(second.rows.length,5);
 assert.equal(first.totalAmount,(9007199254740993n*105n).toString());assert.equal(second.totalAmount,first.totalAmount);
});
