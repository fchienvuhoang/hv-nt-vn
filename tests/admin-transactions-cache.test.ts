import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {encodeAdmin,decodeAdmin} from '../src/lib/admin-codec';
import {transactionDates} from '../src/lib/transaction-scope';

test('transaction result cache reuses normalized filters, preserves money/dates and expires on ledger invalidation',async()=>{
 let reads=0,revision=0,syncVersion=0;
 const stored=new Map<string,unknown>(),configs:{tags:string[];revalidate:number|false}[]=[];
 const amount=9007199254740993n,at=new Date('2026-11-21T00:00:00Z');
 const modules:Record<string,unknown>={
  './sync-metadata-cache':{cachedSyncAccountStatus:async()=>[{checkedAt:syncVersion}]},
  'server-only':{},'./admin-codec':{encodeAdmin,decodeAdmin},
  './cache-tags':{ADMIN_LEDGER_TAG:'admin-ledger',ADMIN_SYNC_TAG:'admin-sync'},'./public-data':{PUBLIC_TAG:'public-ledger'},
  './domain':{localDate:()=> '2026-11-21'},'./transaction-scope':{transactionDates},
  './transaction-navigation-data':{transactionWhere:()=>({}),transactionNavigationData:async()=>({total:1,groups:[],funds:[],accounts:[]})},
  './db':{db:{bankTransaction:{findMany:async()=>{reads++;return [{amount,occurredAt:at,notes:[],allocations:[],fund:null}]},count:async()=>1}}},
  'next/cache':{unstable_cache:(work:(...args:unknown[])=>Promise<unknown>,parts:string[],options:{tags:string[];revalidate:number|false})=>{
   configs.push(options);
   return async(...args:unknown[])=>{const key=JSON.stringify([parts,args,revision]);if(!stored.has(key))stored.set(key,JSON.parse(JSON.stringify(await work(...args))));return stored.get(key)};
  }},
 };
 const api={} as typeof import('../src/lib/admin-read-model');
 vm.runInNewContext(ts.transpile(readFileSync('src/lib/admin-read-model.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports:api,Date,require:(name:string)=>modules[name]??{}});
 const first=await api.loadAdminTransactions({});
 const second=await api.loadAdminTransactions({page:'1',ignored:'anything',q:''});
 assert.equal(reads,1,'equivalent empty requests share the cached page');
 syncVersion++;const statusOnly=await api.loadAdminTransactions({});assert.equal(reads,1,'sync-only status changes must not refetch ledger rows');assert.equal(statusOnly.accounts[0].checkedAt,1);
 assert.equal(second.rows[0].amount,amount);assert.equal(first.rows[0].occurredAt.toISOString(),at.toISOString());
 await api.loadAdminTransactions({q:'other'});assert.equal(reads,2,'search has a separate key');
 await api.loadAdminTransactions({page:'2'});assert.equal(reads,3,'pages do not share rows');
 revision++;await api.loadAdminTransactions({});assert.equal(reads,4,'ledger invalidation forces a fresh read');
 assert.ok(configs.some(c=>c.revalidate===false&&c.tags.includes('admin-ledger')&&c.tags.includes('public-ledger')));
});

test('navigation derives counts and date ranges from one grouped query and one allocation query',async()=>{
 let groups=0,allocations=0;
 const base=[{fundId:null,_count:3,_min:{occurredAt:new Date('2026-01-01')},_max:{occurredAt:new Date('2026-02-01')}},{fundId:'a',_count:2,_min:{occurredAt:new Date('2026-03-01')},_max:{occurredAt:new Date('2026-04-01')}}];
 const modules:Record<string,unknown>={
  'react':{cache:(work:unknown)=>work},'next/cache':{unstable_cache:(work:unknown)=>work},
  './sync-metadata-cache':{cachedSyncAccountStatus:async()=>[]},'./public-data':{PUBLIC_TAG:'public-ledger'},'./cache-tags':{ADMIN_LEDGER_TAG:'admin-ledger'},
  './db':{db:{bankTransaction:{groupBy:async()=>{groups++;return base},count:async()=>8},fundAllocation:{findMany:async()=>{allocations++;return [{fundId:'a',transaction:{occurredAt:new Date('2026-01-01')}},{fundId:'a',transaction:{occurredAt:new Date('2026-05-01')}},{fundId:'b',transaction:{occurredAt:new Date('2026-06-01')}}]}},fund:{findMany:async()=>[]}}},
 };
 const api={} as typeof import('../src/lib/transaction-navigation-data');
 vm.runInNewContext(ts.transpile(readFileSync('src/lib/transaction-navigation-data.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports:api,require:(name:string)=>modules[name]??{}});
 const data=await api.transactionNavigationData();
 assert.equal(groups,1);assert.equal(allocations,1);
 assert.equal(data.groups.find(g=>g.fundId===null)?._count,3);
 assert.equal(data.groups.find(g=>g.fundId==='a')?._count,4);
 assert.equal(data.groups.find(g=>g.fundId==='b')?._count,1);
 assert.equal(data.history.some(h=>h.fundId===null),false);
 const a=data.history.find(h=>h.fundId==='a')!;
 assert.equal(a.from,'2026-01-01T00:00:00.000Z');assert.equal(a.to,'2026-05-01T00:00:00.000Z');assert.equal(a.count,4);
});
