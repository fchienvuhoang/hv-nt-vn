import "server-only";
import {createHash} from "node:crypto";
import {getCache} from "@vercel/functions";
import type {SourceItem} from "./source";
import {localDate,parseSourceTime} from "./domain";
import {allowedBankSyncTime} from "./sync-boundary";
const TTL=72*3600,MAX_ENTRIES=4000;
type Entry={hash:string;verifiedAt:number};
type Bucket=Record<string,Entry>;
type Store=Pick<ReturnType<typeof getCache>,"get"|"set">;
export const bankSourceFingerprint=(item:SourceItem)=>createHash("sha256").update(JSON.stringify(item)).digest("hex");
async function cacheIO<T>(work:Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Cache timeout")),750)})])}finally{clearTimeout(timer)}
}
const identity=(id:string)=>createHash("sha256").update(id).digest("hex");
/** Only fingerprints are cached. No donor names, narratives, or financial payloads. */
export async function prepareBankPage(accountId:string,input:SourceItem[],options:{useCache?:boolean;now?:number;store?:Store}={}){
 const enabled=process.env.BANK_INGEST_CACHE_ENABLED!=="0",now=options.now??Date.now(),useCache=options.useCache!==false&&enabled;
 const items=input.filter(i=>allowedBankSyncTime(i.transactionTime));
 let store:Store|undefined=enabled?options.store:undefined;
 try{if(enabled)store??=getCache({namespace:"hvntvn-bank-ingest-v1"})}catch{/* A missing cache only costs an extra DB lookup. */}
 const buckets=new Map<string,Bucket>();
 const keyFor=(item:SourceItem)=>{const at=parseSourceTime(item.transactionTime).getTime();return at>=now-TTL*1000&&at<=now?`${accountId}:${localDate(new Date(at))}`:null};
 const keys=[...new Set(items.map(keyFor).filter((k):k is string=>k!==null))];
 async function load(key:string){
  if(buckets.has(key))return buckets.get(key)!;
  let value:unknown;try{value=store?await cacheIO(store.get(key)):null}catch{/* Fail open to Postgres. */}
  const bucket:Bucket={};
  if(value&&typeof value==="object")for(const [id,entry]of Object.entries(value)){
   const e=entry as Entry;if(/^[a-f0-9]{64}$/.test(id)&&e&&typeof e.hash==="string"&&/^[a-f0-9]{64}$/.test(e.hash)&&typeof e.verifiedAt==="number"&&e.verifiedAt>now-TTL*1000&&e.verifiedAt<=now)bucket[id]=e;
  }
  buckets.set(key,bucket);return bucket;
 }
 if(useCache)await Promise.all(keys.map(load));
 const hashes=new Map(items.map(i=>[i.id,bankSourceFingerprint(i)]));
 const pending=items.filter(item=>{const key=keyFor(item);return !useCache||!key||buckets.get(key)?.[identity(item.id)]?.hash!==hashes.get(item.id)});
 const knownCount=items.length-pending.length;
 return {items:pending,knownCount,
  // Call ONLY after the surrounding DB transaction commits, never inside its callback.
  async committed(){
   if(!store)return;
   const changed=new Map<string,SourceItem[]>();
   for(const item of pending){const key=keyFor(item);if(key)changed.set(key,[...(changed.get(key)??[]),item])}
   await Promise.all([...changed].map(async([key,verified])=>{
    try{
     const bucket=await load(key);
     for(const item of verified)bucket[identity(item.id)]={hash:hashes.get(item.id)!,verifiedAt:now};
     const bounded=Object.fromEntries(Object.entries(bucket).sort((a,b)=>b[1].verifiedAt-a[1].verifiedAt).slice(0,MAX_ENTRIES));
     await cacheIO(store!.set(key,bounded,{ttl:TTL}));
    }catch{/* A cache failure must not turn a committed bank page into a failed sync. */}
   }));
  }
 };
}
