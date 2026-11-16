import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import {z} from 'zod';
import {fundMembership,fundShare} from '../src/lib/allocation';
import {fundUsesAccount,vnd} from '../src/lib/domain';
import {transferBalanceError} from '../src/lib/transfer-balance';
function fixture(count=250){
 const funds=['from','to'].map(id=>({id,code:id,name:id,accountId:'account',accountIds:[],income:id==='from'?10000n:0n,transferIn:0n,transferOut:0n,openingTransferNet:0n,balance:id==='from'?10000n:0n,byAccount:[{accountId:'account',balance:id==='from'?10000n:0n}]}));
 const rows=Array.from({length:count},(_,i)=>({id:`row-${i}`,fundId:'from',allocations:[] as {fundId:string;amount:bigint}[],accountId:'account',account:{number:'123'},refId:`ref-${i}`,narrative:'Hùn phước',displayName:'Thí chủ',occurredAt:new Date(2026,0,1,0,0,count-i),updatedAt:new Date(2026,0,1),amount:10n}));
 const requests:{take:number;cursor?:{id:string};skip?:number}[]=[];
 const tx={bankTransaction:{findMany:async(input:typeof requests[number])=>{requests.push(input);const start=input.cursor?rows.findIndex(r=>r.id===input.cursor!.id)+(input.skip??0):0;return rows.slice(start,start+input.take);}},bankAccount:{findMany:async()=>[{id:'account',number:'123'}]}};
 const dependencies:Record<string,unknown>={'server-only':{},'node:crypto':crypto,zod:{z},'./ledger':{serializable:async(fn:(tx:unknown)=>unknown)=>fn(tx),fundTotals:async(_tx:unknown,ids:string[])=>{assert.deepEqual(Array.from(ids),['from','to']);return funds;}},'./allocation':{fundMembership,fundShare},'./allocation-write':{},'./actor':{},'./domain':{fundUsesAccount,vnd},'./transfer-balance':{transferBalanceError}};
 const api={} as typeof import('../src/lib/allocation-transfers');
 vm.runInNewContext(ts.transpile(readFileSync('src/lib/allocation-transfers.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports:api,require:(name:string)=>{if(!(name in dependencies))throw Error(name);return dependencies[name];}});
 const input={fromFundId:'from',toFundId:'to',mode:'AMOUNT' as const,value:'15',reason:'Chuyển phần dư'};
 return {api,rows,requests,funds,input};
}
test('preview reads only the first receipt batch when sufficient and splits exactly',async()=>{
 const {api,input,requests,rows}=fixture();const result=await api.previewAllocationTransfer(input);
 assert.equal(requests.length,1);assert.equal(requests[0].take,100);assert.equal(result.items.length,2);
 assert.equal(result.items[1].amount,'5');assert.equal(result.items[1].sourceAfter,'5');assert.equal(result.sourceBalanceAfter,'9985');
 assert.equal(rows[1].amount,10n,'preview never modifies the original receipt');
});
test('preview crosses cursor boundaries without duplicates and keeps fingerprint stable',async()=>{
 const {api,input,requests}=fixture();input.value='1005';
 const result=await api.previewAllocationTransfer(input);
 assert.equal(requests.length,2);assert.equal(requests[1].cursor?.id,'row-99');assert.equal(requests[1].skip,1);
 assert.equal(result.items.length,101);assert.equal(new Set(result.items.map(r=>r.transactionId)).size,101);
 assert.equal(result.items[100].amount,'5');assert.equal(result.balanceItems.length,0);
 assert.equal(result.fingerprint,(await api.previewAllocationTransfer(input)).fingerprint);
});
test('preview falls back to carried balance after exhausting receipts and still rejects overspending',async()=>{
 const {api,input,funds}=fixture(2);input.value='25';
 const result=await api.previewAllocationTransfer(input);assert.equal(result.items.length,2);assert.equal(result.balanceItems[0].amount,'5');
 assert.equal([...result.items,...result.balanceItems].reduce((n,r)=>n+BigInt(r.amount),0n),25n);
 funds[0].byAccount[0].balance=20n;
 await assert.rejects(api.previewAllocationTransfer(input),/Không đủ số dư/);
});

test('single-account destination accepts original receipts held in another bank account',async()=>{
 const {api,input,funds,rows}=fixture();
 funds[1].accountId='other-account';funds[1].accountIds=[];funds[1].byAccount=[{accountId:'other-account',balance:0n}];
 const result=await api.previewAllocationTransfer(input);
 assert.equal(result.amount,'15');assert.equal(result.items.length,2);
 assert.ok(result.items.every(item=>item.accountId==='account'));
 assert.equal(rows[0].accountId,'account');assert.equal(funds[1].accountId,'other-account');
});
test('single-account destination accepts carried balance from another original account',async()=>{
 const {api,input,funds}=fixture(0);
 funds[1].accountId='other-account';funds[1].byAccount=[{accountId:'other-account',balance:0n}];
 const result=await api.previewAllocationTransfer(input);
 assert.equal(result.items.length,0);assert.equal(result.balanceItems.length,1);
 assert.equal(result.balanceItems[0].accountId,'account');assert.equal(result.balanceItems[0].amount,'15');
 assert.equal(result.balanceItems[0].destinationBefore,'0');assert.equal(result.balanceItems[0].destinationAfter,'15');
});
