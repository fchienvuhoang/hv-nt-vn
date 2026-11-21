type CacheStub={getValue(key:string):Promise<unknown>;setValue(key:string,value:unknown,ttl?:number):Promise<unknown>;deleteValue(key:string):Promise<unknown>};
export type ObjectCacheNamespace={idFromName(name:string):unknown;get(id:unknown,options:{locationHint:string}):CacheStub};
import type {RuntimeCache} from './runtime-cache';
/** Keep the existing key/shard layout identical for both Next and native Workers. */
export function objectRuntimeCache(objects:ObjectCacheNamespace,namespace:string):RuntimeCache{
 const shard=(key:string)=>{let hash=2166136261;for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619);return (hash>>>0)%16;};
 const stub=(key:string)=>objects.get(objects.idFromName(`${namespace}:v1:${shard(key)}`),{locationHint:'apac-se'});
 return {
  async get(key){return stub(key).getValue(key);},
  async delete(key){await stub(key).deleteValue(key);},
  async set(key,value,options){await stub(key).setValue(key,value,options?.ttl);},
 };
}
