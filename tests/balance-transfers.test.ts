import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import {z} from 'zod';
import {actorStamp} from '../src/lib/actor';
import {transferBalanceError} from '../src/lib/transfer-balance';
class AllocationTransferError extends Error{}
function fixture(){
 const funds=[{id:'from',code:'TP97',name:'Nguồn',fundingIncome:264917312n,balance:6055312n,byAccount:[{accountId:'a',balance:4000000n},{accountId:'b',balance:2055312n}]},{id:'to',code:'QUY',name:'Nhận',fundingIncome:59003389n,balance:57753389n,byAccount:[{accountId:'b',balance:57753389n}]}];
 const transfers:Record<string,unknown>[]=[];const balanceItems:Record<string,unknown>[]=[];const audits:unknown[]=[];
 const tx={transfer:{findUnique:async({where}:{where:{requestId:string}})=>transfers.find(t=>t.requestId===where.requestId)??null,create:async({data}:{data:Record<string,unknown>})=>{const result={id:`t-${transfers.length}`,...data};transfers.push(result);return result;}},transferBalanceItem:{createMany:async({data}:{data:Record<string,unknown>[]})=>balanceItems.push(...data)},auditLog:{create:async(data:unknown)=>audits.push(data)},bankAccount:{findMany:async()=>[{id:'a',number:'0572'},{id:'b',number:'0856'}]}};
 // No bankTransaction, fundAllocation, notes or donor models: any access fails this fixture.
 const dependencies:Record<string,unknown>={'server-only':{},'node:crypto':crypto,zod:{z},'./ledger':{serializable:async(fn:(tx:unknown)=>unknown)=>fn(tx),fundTotals:async(_tx:unknown,ids:string[])=>{assert.deepEqual(Array.from(ids),['from','to']);return funds;}},'./actor':{actorStamp},'./transfer-balance':{transferBalanceError},'./allocation-transfers':{AllocationTransferError}};
 const api={} as typeof import('../src/lib/balance-transfers');
 vm.runInNewContext(ts.transpile(readFileSync('src/lib/balance-transfers.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports:api,require:(name:string)=>{if(!(name in dependencies))throw Error(name);return dependencies[name];}});
 const input={fromFundId:'from',toFundId:'to',mode:'AMOUNT' as 'AMOUNT'|'TARGET_INCOME',value:'6055312',reason:'Đóng TP97, chuyển số dư'};
 return {api,input,funds,transfers,balanceItems,audits,tx,dependencies};
}
test('balance preview cuts exact amount across original accounts without reading donor transactions',async()=>{
 const {api,input}=fixture();const plan=await api.previewBalanceTransfer(input);
 assert.equal(plan.items.length,0);assert.equal(plan.balanceItems.length,2);assert.equal(plan.sourceBalanceAfter,'0');
 assert.deepEqual(Array.from(plan.balanceItems,i=>i.amount),['4000000','2055312']);
 assert.equal(plan.balanceItems[0].destinationBefore,'0');assert.equal(plan.destinationBalanceAfter,'63808701');
});
test('balance confirmation writes only transfer, account balance entries and audit, and is idempotent',async()=>{
 const {api,input,transfers,balanceItems,audits}=fixture();const plan=await api.previewBalanceTransfer(input);
 const request={...input,requestId:crypto.randomUUID(),fingerprint:plan.fingerprint};
 const saved=await api.commitBalanceTransfer(request,'admin');const repeat=await api.commitBalanceTransfer(request,'admin');
 assert.equal(saved.id,repeat.id);assert.equal(transfers.length,1);assert.equal(saved.mode,'BALANCE_ONLY');assert.equal(saved.accountId,null);
 assert.equal(balanceItems.length,2);assert.equal(balanceItems.reduce((n,i)=>n+(i.amount as bigint),0n),6055312n);assert.equal(audits.length,1);
 await assert.rejects(api.commitBalanceTransfer({...request,value:'1'},'admin'),/Mã yêu cầu/);
});
test('changed balances invalidate confirmation before any writes',async()=>{
 const {api,input,funds,transfers}=fixture();const plan=await api.previewBalanceTransfer({...input,value:'100'});
 funds[0].balance-=1n;funds[0].byAccount[0].balance-=1n;
 await assert.rejects(api.commitBalanceTransfer({...input,value:'100',requestId:crypto.randomUUID(),fingerprint:plan.fingerprint},'admin'),/Số dư đã thay đổi/);
 assert.equal(transfers.length,0);
});
test('balance transfer enforces selected account, net balance and target income',async()=>{
 const {api,input,funds}=fixture();
 await assert.rejects(api.previewBalanceTransfer({...input,accountId:'b'}),/Không đủ/);
 await assert.rejects(api.previewBalanceTransfer({...input,value:'6055313'}),/Không đủ/);
 const target=await api.previewBalanceTransfer({...input,mode:'TARGET_INCOME',value:'258862000'});
 assert.equal(target.amount,'6055312');assert.equal(target.incomeAfter,'258862000');
 funds[0].byAccount[1].balance=-3999999n;funds[0].balance=1n;
 await assert.rejects(api.previewBalanceTransfer({...input,value:'2'}),/Không đủ/);
});

test('balance-only records can be reversed on original accounts without moving donor shares',async()=>{
 const {api,input,funds,balanceItems,transfers,tx,dependencies}=fixture();
 const preview=await api.previewBalanceTransfer(input);
 const saved=await api.commitBalanceTransfer({...input,requestId:crypto.randomUUID(),fingerprint:preview.fingerprint},'admin');
 funds[0].balance=0n;funds[0].byAccount.forEach(a=>a.balance=0n);
 funds[1].balance+=6055312n;funds[1].byAccount=[{accountId:'a',balance:4000000n},{accountId:'b',balance:59808701n}];
 const emptyWrite=async({data}:{data:unknown[]})=>assert.equal(data.length,0,'reversal must not write donor records');
 Object.assign(tx,{transferItem:{findMany:async()=>[],createMany:emptyWrite},transactionNote:{createMany:emptyWrite}});
 Object.assign(tx.transferBalanceItem,{findMany:async()=>balanceItems.slice(0,2)});
 const allocationDeps={...dependencies,'./ledger':{fundTotals:async()=>funds},'./allocation':{},'./allocation-write':{moveShares:async(_tx:unknown,moves:unknown[])=>{assert.equal(moves.length,0);return [];}},'./domain':{}};
 const allocation={} as typeof import('../src/lib/allocation-transfers');
 vm.runInNewContext(ts.transpile(readFileSync('src/lib/allocation-transfers.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports:allocation,require:(name:string)=>{if(!(name in allocationDeps))throw Error(name);return allocationDeps[name as keyof typeof allocationDeps];}});
 await allocation.reverseAllocationTransfer(tx as never,{id:saved.id,amount:6055312n,fromFundId:'from',toFundId:'to',accountId:null},'Đảo số dư thử nghiệm','admin');
 assert.equal(transfers.length,2);assert.equal(transfers[1].reversalOf,saved.id);
 assert.equal(balanceItems.length,4);assert.equal(balanceItems[2].sourceAfter,0n);assert.equal(balanceItems[2].destinationAfter,4000000n);
 assert.equal(balanceItems[3].sourceAfter,57753389n);assert.equal(balanceItems[3].destinationAfter,2055312n);
});
