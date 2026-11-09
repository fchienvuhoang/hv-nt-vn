import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {VersionedJsonCache} from "../src/lib/versioned-json-cache";
import {localDate,vietnamMonth} from "../src/lib/domain";
import {publicSearchText,publicSearchTerms,matchesPublicSearchText} from "../src/lib/public-search";

// Exercise the real server module against isolated stores, never a financial DB.
function fixture() {
  const store=new Map<string,unknown>();
  const calls:{direction:string;page:number;kind:string}[]=[];
  let revision=1;
  const fund=(page:number,direction:string)=>({id:"fund",fundingVersion:3,goalAmount:null,month:"",isLongTerm:false,count:205,counts:{CREDIT:205,DEBIT:205},page,rows:Array.from({length:page<3?100:5},(_,i)=>({id:`${direction}-${page}-${i}`,at:"2026-11-09T00:00:00Z",narrative:"public",name:"donor",amount:"2",originalAmount:"9",account:"123",notes:[]}))});
  const dependencies:Record<string,unknown>={
    "server-only":{},
    "./versioned-json-cache":{VersionedJsonCache},
    "./domain":{localDate,vietnamMonth},
    "./operation-metrics":{measureOperations:(_flow:string,work:()=>unknown)=>work()},
    "@vercel/functions":{getCache:()=>({get:async(key:string)=>store.get(key)??null,set:async(key:string,value:unknown)=>{store.set(key,value)}})},
    "node:crypto":{randomUUID:()=>"version"},
    "next/cache":{revalidateTag:()=>{}},
    "./db":{db:{fund:{findUnique:async()=>({id:"fund"})},publicCacheRefresh:{findUnique:async()=>({requestedVersion:revision})}}},
    "./cache-tags":{publicFundTag:(id:string)=>id},
    "./public-search":{publicSearchText,publicSearchTerms,matchesPublicSearchText},
    "./public-data":{
      PUBLIC_PAGE_SIZE:100,
      publicFundDTO:(value:unknown)=>value,
      publicFund:async(_slug:string,page:number,direction:string)=>{calls.push({direction,page,kind:"summary"});return fund(page,direction)},
      publicTransactionPage:async(_id:string,direction:string,page:number)=>{calls.push({direction,page,kind:"rows"});return fund(page,direction).rows},
    },
  };
  const exports={} as typeof import("../src/lib/public-snapshot");
  vm.runInNewContext(ts.transpile(readFileSync("src/lib/public-snapshot.ts","utf8"),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{
    exports,Buffer,console,require:(name:string)=>{if(!(name in dependencies))throw Error(`Unexpected dependency: ${name}`);return dependencies[name]},
  });
  return {api:exports,calls,store,setRevision:(value:number)=>{revision=value;store.set("revision:fund",value)}};
}

test("cold page reads only the requested page/direction and retains split amounts",async()=>{
  const {api,calls}=fixture();
  const response=await api.snapshotResponse("slug",2,"DEBIT","");
  assert.ok(response);assert.equal(response.hit,false);
  assert.equal(response.data.page,2);assert.equal(response.data.rows.length,100);
  assert.equal(response.data.rows[0].amount,"2");assert.equal(response.data.rows[0].originalAmount,"9");
  assert.deepEqual(calls,[{direction:"DEBIT",page:2,kind:"summary"}]);
});

test("coalesced warmup reads summary once and preserves pagination and revision invalidation",async()=>{
  const {api,calls,setRevision}=fixture();
  await Promise.all([api.warmPublicSnapshot("slug"),api.warmPublicSnapshot("slug")]);
  assert.equal(calls.filter(c=>c.kind==="summary").length,1);
  assert.equal(calls.filter(c=>c.kind==="rows").length,5);
  for(const direction of ["CREDIT","DEBIT"] as const){
    const warm=await api.snapshotResponse("slug",3,direction,"");
    assert.ok(warm);assert.equal(warm.hit,true);assert.equal(warm.data.rows.length,5);
    assert.equal(warm.data.rows[0].id,`${direction}-3-0`);
    assert.equal(warm.data.rows[0].amount,"2");assert.equal(warm.data.rows[0].originalAmount,"9");
  }
  const count=calls.length;setRevision(2);
  const changed=await api.snapshotResponse("slug",1,"CREDIT","");
  assert.ok(changed);assert.equal(changed.hit,false,"obsolete financial snapshot must never be served");
  assert.equal(calls.length,count+1);
});

test("search still reads the entire snapshot and missing manifests cannot hit local memory",async()=>{
  const {api,store}=fixture();
  const searched=await api.snapshotResponse("slug",1,"CREDIT","public");
  assert.ok(searched);assert.equal(searched.data.count,205);
  store.delete("fund:slug");
  assert.equal(await api.readPublicSnapshot("slug"),null);
});
