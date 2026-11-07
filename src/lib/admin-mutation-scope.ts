import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {revalidateTag} from 'next/cache';
import {ADMIN_LEDGER_TAG,PUBLIC_DIRECTORY_TAG,publicFundTag} from './cache-tags';
import {db} from './db';
/** Resolve both old and new owners before a write; unknown/bulk workflows safely rebuild all. */
export async function mutationFundScope(resource:string,request:Request):Promise<string[]|undefined>{
 const copy=request.clone();
 const data:Record<string,unknown>=copy.headers.get('content-type')?.includes('application/json')?await copy.json():Object.fromEntries(await copy.formData());
 const string=(key:string)=>typeof data[key]==='string'?data[key] as string:undefined;
 if(resource==='funds')return string('id')?[string('id')!]:undefined;
 if(resource==='funds/visibility'||resource==='funds/pin')return string('fundId')?[string('fundId')!]:undefined;
 const ids=new Set<string>();
 for(const key of ['fundId','sourceFundId','targetFundId','fromFundId','toFundId'])if(string(key))ids.add(string(key)!);
 if(resource==='transactions/split'&&Array.isArray(data.shares))for(const share of data.shares)if(share&&typeof share.fundId==='string')ids.add(share.fundId);
 if(['transactions/split','transactions/assignment','transaction-notes','transactions/review'].includes(resource)){
  const id=string('transactionId')??string('id');if(!id)return undefined;
  const rows=await db.bankTransaction.findMany({where:{id:{in:[id,...(string('targetId')?[string('targetId')!]:[])]}},select:{fundId:true,originalAllocations:true,allocations:{select:{fundId:true}},allocationTransfers:{select:{transfer:{select:{fromFundId:true,toFundId:true}}}}}});
  for(const row of rows){
   if(row.fundId)ids.add(row.fundId);
   if(Array.isArray(row.originalAllocations))for(const share of row.originalAllocations)if(share&&typeof share==='object'&&'fundId' in share&&typeof share.fundId==='string')ids.add(share.fundId);
   for(const a of row.allocations)ids.add(a.fundId);
   for(const a of row.allocationTransfers){ids.add(a.transfer.fromFundId);ids.add(a.transfer.toFundId);}
  }
  return [...ids];
 }
 // Import reconciliation can merge a bank entry that previously belonged to another fund.
 if(resource==='imports/commit')return undefined;
 if(resource==='transfers/reversal'){
  const row=string('transferId')?await db.transfer.findUnique({where:{id:string('transferId')!},select:{fromFundId:true,toFundId:true}}):null;
  return row?[row.fromFundId,row.toFundId]:undefined;
 }
 if(resource==='reclassification'){
  if(data.phase!=='APPLY')return [];
  const rows=await db.tabReclassificationItem.findMany({where:{runId:string('id')??''},select:{beforeFundId:true,plannedFundId:true}});
  return [...new Set(rows.flatMap(r=>[r.beforeFundId,r.plannedFundId]).filter((id):id is string=>!!id))];
 }
 if(resource==='transactions/assignments'){
  if(!Array.isArray(data.rows))return undefined;
  const rows=await db.bankTransaction.findMany({where:{id:{in:data.rows.map((r:{id:string})=>r.id)}},select:{fundId:true,originalAllocations:true,allocations:{select:{fundId:true}},allocationTransfers:{select:{transfer:{select:{fromFundId:true,toFundId:true}}}}}});
  for(const row of rows){if(row.fundId)ids.add(row.fundId);if(Array.isArray(row.originalAllocations))for(const s of row.originalAllocations)if(s&&typeof s==='object'&&'fundId' in s&&typeof s.fundId==='string')ids.add(s.fundId);for(const a of row.allocations)ids.add(a.fundId);for(const a of row.allocationTransfers){ids.add(a.transfer.fromFundId);ids.add(a.transfer.toFundId);}}
  return [...ids];
 }
 if(resource==='transfers/allocate')return ids.size?[...ids]:undefined;
 if(resource==='transfers')return ids.size?[...ids]:undefined;
 return undefined;
}

export const mutationScope=new AsyncLocalStorage<string[]|undefined>();
export function invalidateMutation(){
 revalidateTag(ADMIN_LEDGER_TAG,{expire:0});revalidateTag(PUBLIC_DIRECTORY_TAG,{expire:0});
 const ids=mutationScope.getStore();
 if(ids)for(const id of ids)revalidateTag(publicFundTag(id),{expire:0});
 else revalidateTag('public-ledger',{expire:0});
}
