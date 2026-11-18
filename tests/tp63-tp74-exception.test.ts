import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import {actorStamp} from '../src/lib/actor';

function fixture() {
 const funds = [
  {id:'from',code:'TP63',name:'Gotami',accountId:'cmvw2f3kh00000or3r3fgruqs',account:{number:'0572'},income:821277671n,expense:825825000n,count:872,balance:-4547329n,byAccount:[{accountId:'cmvw2f3kh00000or3r3fgruqs',balance:-4747329n},{accountId:'b',balance:200000n}]},
  {id:'to',code:'TP74',name:'Tôn tượng',accountId:'cmvw2f3kh00000or3r3fgruqs',account:{number:'0572'},income:0n,expense:0n,count:0,balance:0n,byAccount:[{accountId:'cmvw2f3kh00000or3r3fgruqs',balance:0n},{accountId:'b',balance:0n}]},
 ];
 let saved:Record<string,unknown>|undefined;
 let duplicate = false, reversed = false, corruptAfter = false;
 const items:Record<string,unknown>[] = [], audits:unknown[] = [];
 const tx = {
  fund:{findMany:async()=>funds},
  transfer:{findUnique:async({where}:{where:{requestId?:string;reversalOf?:string}})=>where.reversalOf?(reversed?{id:'reversal'}:null):saved,
   findFirst:async()=>duplicate?{id:'duplicate'}:null,
   create:async({data}:{data:Record<string,unknown>})=>(saved={...data,id:'transfer',fromFund:funds[0],toFund:funds[1],balanceItems:items})},
  transferBalanceItem:{createMany:async({data}:{data:Record<string,unknown>[]})=>{items.push(...data);funds[0].balance-=25000000n;funds[0].byAccount[0].balance-=25000000n;funds[1].balance+=25000000n;funds[1].byAccount[0].balance+=25000000n;if(corruptAfter)funds[1].balance++;}},
  auditLog:{create:async(data:unknown)=>audits.push(data)},
 };
 const deps:Record<string,unknown>={'server-only':{},'node:crypto':crypto,'./actor':{actorStamp},'./ledger':{serializable:async(fn:(client:unknown)=>unknown)=>fn(tx),fundTotals:async()=>funds.map(f=>({...f,byAccount:f.byAccount.map(a=>({...a}))}))}};
 const api={} as typeof import('../src/lib/tp63-tp74-exception');
 vm.runInNewContext(ts.transpile(readFileSync('src/lib/tp63-tp74-exception.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports:api,require:(name:string)=>{if(!(name in deps))throw Error(name);return deps[name];}});
 return {api,funds,items,audits,get saved(){return saved;},set duplicate(v:boolean){duplicate=v;},set reversed(v:boolean){reversed=v;},set corruptAfter(v:boolean){corruptAfter=v;}};
}
test('one-time preview never writes; commit cuts exactly 25m on 0572 with an authorization audit',async()=>{
 const f=fixture();
 const preview=await f.api.runTp63Tp74Exception();
 assert.equal(preview.status,'PREVIEW');assert.equal(f.saved,undefined);
 const result=await f.api.runTp63Tp74Exception(true);
 assert.equal(result.status,'COMMITTED');assert.equal(f.funds[0].balance,-29547329n);assert.equal(f.funds[1].balance,25000000n);
 assert.equal(f.items.length,1);assert.equal(f.items[0].accountId,'cmvw2f3kh00000or3r3fgruqs');assert.equal(f.items[0].sourceAfter,-29747329n);
 assert.equal(f.funds[0].byAccount[1].balance,200000n);assert.equal(f.audits.length,1);
 assert.match(JSON.stringify(f.audits),/negativeBalanceAuthorized.*true/);
 assert.equal((await f.api.runTp63Tp74Exception(true)).status,'ALREADY_COMMITTED');assert.equal(f.items.length,1);assert.equal(f.audits.length,1);
 f.reversed=true;await assert.rejects(f.api.runTp63Tp74Exception(true),/đã được ghi rồi đảo/);
});
test('refuses other codes, accounts, changed balances and pre-existing equal transfers',async()=>{
 for(const mutate of [(f:ReturnType<typeof fixture>)=>{f.funds[0].code='OTHER';},(f:ReturnType<typeof fixture>)=>{f.funds[0].account.number='0856';},(f:ReturnType<typeof fixture>)=>{f.funds[0].balance++;},(f:ReturnType<typeof fixture>)=>{f.duplicate=true;}]) {
  const f=fixture();mutate(f);await assert.rejects(f.api.runTp63Tp74Exception(true));assert.equal(f.saved,undefined);assert.equal(f.items.length,0);
 }
});
test('post-write mismatch throws inside the transaction to trigger rollback',async()=>{
 const f=fixture();f.corruptAfter=true;await assert.rejects(f.api.runTp63Tp74Exception(true),/Đối chiếu sau ghi thất bại/);
});
