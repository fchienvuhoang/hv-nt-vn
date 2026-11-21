import "server-only";
import {getCache as vercelCache} from "@vercel/functions";
import {cloudflareContext} from "./cloudflare-context";

export interface RuntimeCache {
  get(key:string):Promise<unknown>;
  delete(key:string):Promise<unknown>;
  set(key:string,value:unknown,options?:{ttl?:number}):Promise<unknown>;
}
/** R2 reads are strongly consistent, including the snapshot revision and manifest. */
export function getCache({namespace}:{namespace:string}):RuntimeCache {
  const context=cloudflareContext();
  if(!context)return vercelCache({namespace});
  const bucket=context.env.NEXT_INC_CACHE_R2_BUCKET;
  if(!bucket)throw new Error("Missing NEXT_INC_CACHE_R2_BUCKET binding");
  const keyFor=(key:string)=>`app-cache/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;
  return {
    async delete(key){await bucket.delete(keyFor(key));},
    async get(key){
      const object=await bucket.get(keyFor(key));
      if(!object)return null;
      const entry=await object.json<{expiresAt:number|null;value:unknown}>();
      return entry.expiresAt!==null&&entry.expiresAt<=Date.now()?null:entry.value;
    },
    async set(key,value,options){
      const expiresAt=options?.ttl===undefined?null:Date.now()+options.ttl*1000;
      await bucket.put(keyFor(key),JSON.stringify({expiresAt,value}),{httpMetadata:{contentType:"application/json"}});
    },
  };
}
