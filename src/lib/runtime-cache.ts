import "server-only";
import {getCache as vercelCache} from "@vercel/functions";
import {cloudflareContext} from "./cloudflare-context";

import {objectRuntimeCache,type ObjectCacheNamespace} from "./object-runtime-cache";
declare global {interface CloudflareEnv {APP_RUNTIME_CACHE?:ObjectCacheNamespace}}
export interface RuntimeCache {
 get(key:string):Promise<unknown>;
 delete(key:string):Promise<unknown>;
 set(key:string,value:unknown,options?:{ttl?:number}):Promise<unknown>;
}
export function getCache({namespace}:{namespace:string}):RuntimeCache {
 const context=cloudflareContext();
 if(!context)return vercelCache({namespace});
 const objects=context.env.APP_RUNTIME_CACHE;
 if(!objects)throw new Error('Missing APP_RUNTIME_CACHE binding');
 return objectRuntimeCache(objects,namespace);
}
