import 'server-only';
import {db} from './db';
import {cloudflareContext} from './cloudflare-context';
import {runtimeErrorDetails} from './runtime-error';

/** Admin-only diagnostics: booleans and error categories, never secret values. */
export async function runtimeHealth(){
 const context=cloudflareContext();
 const variables=Object.fromEntries(['DATABASE_URL','AUTH_SECRET','AUTH_GOOGLE_ID','AUTH_GOOGLE_SECRET','ADMIN_EMAILS','SYNC_SECRET'].map(name=>[name,!!process.env[name]?.trim()]));
 const bindings=context?Object.fromEntries(['APP_RUNTIME_CACHE','NEXT_INC_CACHE_R2_BUCKET','NEXT_TAG_CACHE_DO_SHARDED','NEXT_CACHE_DO_QUEUE'].map(name=>[name,!!(context.env as Record<string,unknown>)[name]])):{};
 const started=Date.now();
 try{
  await db.$queryRaw`SELECT 1`;
  return {platform:context?'cloudflare':'node',variables,bindings,database:{connected:true,durationMs:Date.now()-started}};
 }catch(error){return {platform:context?'cloudflare':'node',variables,bindings,database:{connected:false,durationMs:Date.now()-started,errors:runtimeErrorDetails(error)}};}
}
