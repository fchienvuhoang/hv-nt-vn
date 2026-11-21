import "server-only";
import {getCache as vercelCache} from "@vercel/functions";
import {cloudflareContext} from "./cloudflare-context";

type CacheStub={getValue(key:string):Promise<unknown>;setValue(key:string,value:unknown,ttl?:number):Promise<unknown>;deleteValue(key:string):Promise<unknown>};
declare global {interface CloudflareEnv {APP_RUNTIME_CACHE?:{idFromName(name:string):unknown;get(id:unknown,options:{locationHint:string}):CacheStub}}}
export interface RuntimeCache {
 get(key:string):Promise<unknown>;
 delete(key:string):Promise<unknown>;
 set(key:string,value:unknown,options?:{ttl?:number}):Promise<unknown>;
}
/** Spread independent keys across small, persistent cache objects near Southeast Asia. */
function shard(key:string){let hash=2166136261;for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619);return (hash>>>0)%16;}
export function getCache({namespace}:{namespace:string}):RuntimeCache {
 const context=cloudflareContext();
 if(!context)return vercelCache({namespace});
 const objects=context.env.APP_RUNTIME_CACHE;
 if(!objects)throw new Error('Missing APP_RUNTIME_CACHE binding');
 const stub=(key:string)=>objects.get(objects.idFromName(`${namespace}:v1:${shard(key)}`),{locationHint:'apac-se'});
 return {
  async get(key){return stub(key).getValue(key);},
  async delete(key){await stub(key).deleteValue(key);},
  async set(key,value,options){await stub(key).setValue(key,value,options?.ttl);},
 };
}
