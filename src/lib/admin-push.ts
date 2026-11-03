import {SITE_ORIGIN} from "./site-url";
import "server-only";
import webpush from "web-push";
import { randomUUID } from "node:crypto";
import { allowedAdmin } from "./admin-allowlist";
import { db } from "./db";
import type { LedgerClient } from "./ledger";
import {pushLabels,pushDestination,transactionPushKind,validPushEndpoint,type PushKind} from "./push-policy";

export function pushConfigured(){return !!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);}
export async function enqueuePush(tx:LedgerClient,events:{key:string;kind:PushKind;transactionId?:string}[]){
  if(!events.length)return;
  const subscriptions=await tx.adminPushSubscription.findMany({include:{preference:true}});
  const data=subscriptions.filter(s=>allowedAdmin(s.email)).flatMap(s=>events.filter(e=>s.preference[e.kind]).map(e=>({subscriptionId:s.id,eventKey:e.key,kind:e.kind,transactionId:e.transactionId})));
  if(data.length)await tx.adminPushDelivery.createMany({data,skipDuplicates:true});
}
export async function enqueueSyncFailure(){
  // One alert per half hour, including repeated failures and balance-source failures.
  try{await enqueuePush(db,[{key:`sync-error:${Math.floor(Date.now()/1800000)}`,kind:"syncError"}]);}
  catch{console.error("Could not queue admin sync alert");}
}
export async function sendAdminPush(subscription:{endpoint:string;p256dh:string;auth:string},payload:{title:string;body:string;url:string;tag:string}){
  if(!pushConfigured())throw new Error("Chưa cấu hình thông báo đẩy.");
  if(!validPushEndpoint(subscription.endpoint))throw new Error("Dịch vụ thông báo không hợp lệ.");
  return webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify({...payload,url:new URL(payload.url,SITE_ORIGIN).href,icon:new URL("/pwa/icon-192.png",SITE_ORIGIN).href}),{
    TTL:3600,urgency:"normal",timeout:3000,
    vapidDetails:{subject:process.env.VAPID_SUBJECT!,publicKey:process.env.VAPID_PUBLIC_KEY!,privateKey:process.env.VAPID_PRIVATE_KEY!},
  });
}
/** Durable delivery queue, bounded work per cron call; never holds up bank ingestion. */
export async function dispatchAdminPush(){
  if(!pushConfigured())return;
  if(!await db.adminPushDelivery.findFirst({where:{finishedAt:null,nextAttemptAt:{lte:new Date()},attempts:{lt:6}},select:{id:true}}))return;
  const token=randomUUID();
  const acquired=await db.$executeRaw`INSERT INTO "SyncLease" (id,token,"expiresAt") VALUES ('admin-push',${token},(NOW() AT TIME ZONE 'UTC')+INTERVAL '45 seconds') ON CONFLICT (id) DO UPDATE SET token=EXCLUDED.token,"expiresAt"=EXCLUDED."expiresAt" WHERE "SyncLease"."expiresAt" < (NOW() AT TIME ZONE 'UTC')`;
  if(!acquired)return;
  try{
    await db.adminPushDelivery.deleteMany({where:{createdAt:{lt:new Date(Date.now()-7*86400000)}}});
    const pending=await db.adminPushDelivery.findMany({where:{finishedAt:null,nextAttemptAt:{lte:new Date()},attempts:{lt:6}},orderBy:{createdAt:"asc"},take:300,include:{subscription:{include:{preference:true}}}});
    const groups=new Map<string,typeof pending>();
    for(const row of pending){const key=`${row.subscriptionId}:${row.kind}`;const group=groups.get(key)??[];group.push(row);groups.set(key,group);}
    await Promise.allSettled([...groups.values()].slice(0,4).map(async rows=>{
      const subscription=rows[0].subscription,kind=rows[0].kind as PushKind;
      const ids=rows.map(r=>r.id);
      if(!allowedAdmin(subscription.email)||!subscription.preference[kind]){
        await db.adminPushDelivery.updateMany({where:{id:{in:ids}},data:{finishedAt:new Date()}});return;
      }
      // Discard alerts already resolved before this delivery attempt.
      const transactions=await db.bankTransaction.findMany({where:{id:{in:rows.flatMap(r=>r.transactionId?[r.transactionId]:[])}},select:{id:true,fundId:true,assignment:true,entryStatus:true,matchReason:true}});
      const active=rows.filter(r=>!r.transactionId||transactions.some(t=>t.id===r.transactionId&&transactionPushKind(t)===kind));
      if(!active.length){await db.adminPushDelivery.updateMany({where:{id:{in:ids}},data:{finishedAt:new Date()}});return;}
      await db.adminPushDelivery.updateMany({where:{id:{in:ids}},data:{attempts:{increment:1},nextAttemptAt:new Date(Date.now()+Math.min(3600000,60000*2**rows[0].attempts))}});
      try{
        await sendAdminPush(subscription,{title:pushLabels[kind],body:kind==="fundGoalReached"?`Có ${active.length} thiện pháp đã đạt mục tiêu thành tựu. Mở trang Thiện pháp để xem.`:kind==="syncError"?"Đồng bộ gặp lỗi. Mở nhật ký quản trị để kiểm tra.":`Có ${active.length} giao dịch mới cần kiểm tra. Mở trang quản trị để xem.`,url:pushDestination(kind),tag:`admin-${kind}`});
        await db.adminPushDelivery.updateMany({where:{id:{in:ids}},data:{finishedAt:new Date()}});
      }catch(error){
        const status=(error as {statusCode?:number}).statusCode;
        if(status===404||status===410)await db.adminPushSubscription.deleteMany({where:{id:subscription.id}});
        else console.error("Admin push delivery failed",status??"transport");
      }
    }));
  }finally{await db.syncLease.deleteMany({where:{id:"admin-push",token}});}
}
export async function dispatchAdminPushSafely(){try{await dispatchAdminPush();}catch{console.error("Admin push queue unavailable");}}
