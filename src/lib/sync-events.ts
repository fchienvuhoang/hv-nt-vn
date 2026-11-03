import 'server-only';
import {getCache} from '@vercel/functions';
import {encodeAdmin,decodeAdmin} from './admin-codec';
import type {SyncInvocation} from '@/generated/prisma/client';
const store=()=>getCache({namespace:'hvntvn-sync-events-v1'});
// A bounded ring of minute slots; concurrent/duplicate callers never rewrite a shared list.
const SIZE=200;
export async function saveSyncEvent(event:SyncInvocation){
 try {await store().set(`slot:${Math.floor(event.receivedAt.getTime()/60000)%SIZE}`,encodeAdmin(event),{ttl:86400});}
 catch {console.error('Sync event cache unavailable');}
}
export async function recentSyncEvents():Promise<SyncInvocation[]>{
 const values=await Promise.all(Array.from({length:SIZE},(_,i)=>store().get(`slot:${i}`).catch(()=>null)));
 return values.filter(Boolean).map(v=>decodeAdmin<SyncInvocation>(v)).sort((a,b)=>b.receivedAt.getTime()-a.receivedAt.getTime());
}
