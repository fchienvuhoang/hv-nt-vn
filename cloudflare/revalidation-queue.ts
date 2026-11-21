import {getCloudflareContext} from '@opennextjs/cloudflare';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import type {Queue} from '@opennextjs/aws/types/overrides.js';

/** Preview service bindings target production. Revalidate inside the Preview instead. */
const queue:Queue={
 name:'hvntvn-revalidation',
 async send(message){
  const env=getCloudflareContext().env as CloudflareEnv&{HVNTVN_PREVIEW?:string};
  if(env.HVNTVN_PREVIEW!=='1')return doQueue.send(message);
  // OpenNext's internal dispatcher stays in this Worker/Preview, without a service binding.
  const internalFetch=(globalThis as unknown as {internalFetch?:typeof fetch}).internalFetch;
  const token=process.env.NEXT_PREVIEW_MODE_ID;
  if(!internalFetch||!token)throw new Error('Preview revalidation dispatcher is not initialized');
  const {host,url}=message.MessageBody;
  const protocol=host.includes('localhost')?'http':'https';
  const response=await internalFetch(`${protocol}://${host}${url}`,{
   method:'HEAD',headers:{'x-prerender-revalidate':token,'x-isr':'1'},signal:AbortSignal.timeout(10000),
  });
  try {if(response.status!==200)throw new Error(`Preview revalidation failed: ${response.status}`);}
  finally {await response.body?.cancel();}
 },
};
export default queue;
