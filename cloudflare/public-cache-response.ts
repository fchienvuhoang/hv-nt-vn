import {objectRuntimeCache,type ObjectCacheNamespace} from '../src/lib/object-runtime-cache';
import {createPublicSnapshotReader,snapshotPage} from '../src/lib/public-snapshot-reader';
import {publicQuery} from '../src/lib/public-query';

// Each namespace gets its own bounded decoded cache, not a request-owned connection.
const readers=new WeakMap<ObjectCacheNamespace,ReturnType<typeof createPublicSnapshotReader>>();
/** Only serve already-public, revision-checked snapshots; every miss uses Next. */
export async function publicCacheResponse(request:Request,env:{APP_RUNTIME_CACHE?:ObjectCacheNamespace}):Promise<Response|null>{
 if(request.method!=='GET'||!env.APP_RUNTIME_CACHE)return null;
 const url=new URL(request.url),match=/^\/api\/public\/funds\/([a-z0-9-]{1,100})$/.exec(url.pathname);
 if(!match||match[1]==='0572-tdts')return null; // Preserve the configured redirect.
 const objects=env.APP_RUNTIME_CACHE;
 let read=readers.get(objects);
 if(!read){read=createPublicSnapshotReader(()=>objectRuntimeCache(objects,'hvntvn-public-snapshot-v1'));readers.set(objects,read);}
 try{
  const started=performance.now(),snapshot=await read(match[1]);
  if(!snapshot)return null;
  const query=publicQuery(Object.fromEntries(url.searchParams));
  const {data}=snapshotPage(snapshot,query.page,query.direction,query.search);
  return Response.json(data,{headers:{
   'Cache-Control':'public, max-age=0, must-revalidate',
   'X-Public-Cache':'HIT','X-Public-Path':'worker-cache',
   'Server-Timing':`snapshot;dur=${(performance.now()-started).toFixed(1)}`,
   'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY',
  }});
 }catch{return null;} // Next retains existing recovery and safe error reporting.
}
