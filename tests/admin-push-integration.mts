import assert from "node:assert/strict";
import webpush from "web-push";
const url=new URL(process.env.DATABASE_URL??"https://invalid");
if(url.hostname!=="localhost"||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Isolated localhost test DB required");
process.env.ADMIN_EMAILS="qa-admin@example.test";
const keys=webpush.generateVAPIDKeys();process.env.VAPID_PUBLIC_KEY=keys.publicKey;process.env.VAPID_PRIVATE_KEY=keys.privateKey;process.env.VAPID_SUBJECT="https://example.test";
const {db}=await import("../src/lib/db");
const {enqueuePush,enqueueSyncFailure,dispatchAdminPush}=await import("../src/lib/admin-push");
const {ingestBankPage}=await import("../src/lib/ingest-bank");
const sent:{title:string;body:string;url:string}[]=[];
let status=201;
webpush.sendNotification=async (_sub,payload)=>{if(status!==201)throw Object.assign(new Error("test"),{statusCode:status});sent.push(JSON.parse(String(payload)));return {statusCode:201,headers:{},body:""};};
try{
 const a=await db.bankAccount.create({data:{number:"0572",owner:"My",label:"My"}}),b=await db.bankAccount.create({data:{number:"0856",owner:"Trâm",label:"Trâm"}});
 await db.fund.create({data:{accountId:a.id,code:"HTTB",name:"HTTB",slug:"qa-push-fund",keywords:[]}});
 const pref=await db.pushPreference.create({data:{email:"qa-admin@example.test",wrongAccount:true,needsClassification:false,syncError:true}});
 const sub=await db.adminPushSubscription.create({data:{email:pref.email,endpoint:"https://fcm.googleapis.com/fcm/send/qa",p256dh:"qa",auth:"qa"}});
 const item=(id:string,narrative:string)=>({id,type:"CREDIT" as const,transactionTime:"2026-11-01T10:00:00+07:00",bankAccountId:b.id,transactionAmount:1000,narrative,refId:id,displayName:"Private donor"});
 const rows=[item("wrong","HTTB"),item("unknown","unknown")];
 await db.$transaction(tx=>ingestBankPage(tx,b.id,rows,"qa"));
 assert.equal(await db.adminPushDelivery.count(),1,"only opted-in category queued");
 await db.$transaction(tx=>ingestBankPage(tx,b.id,rows,"qa"));assert.equal(await db.adminPushDelivery.count(),1,"rescanning must not duplicate alerts");
 await dispatchAdminPush();assert.equal(sent.length,1);assert.ok(sent[0].title.includes("sai tài khoản"));assert.ok(!JSON.stringify(sent).includes("Private donor"));
 await enqueueSyncFailure();await enqueueSyncFailure();assert.equal(await db.adminPushDelivery.count({where:{kind:"syncError"}}),1,"repeated failure deduplicates per window");
 status=503;await dispatchAdminPush();assert.equal(await db.adminPushDelivery.count({where:{kind:"syncError",finishedAt:null,attempts:1}}),1,"transient failure remains queued");
 await db.adminPushDelivery.updateMany({where:{finishedAt:null},data:{nextAttemptAt:new Date(0)}});status=201;await dispatchAdminPush();assert.equal(sent.length,2);
 await enqueuePush(db,[{key:"disabled",kind:"wrongAccount"}]);await db.pushPreference.update({where:{email:pref.email},data:{wrongAccount:false}});await dispatchAdminPush();assert.equal(sent.length,2,"preference checked again before delivery");
 await db.pushPreference.update({where:{email:pref.email},data:{wrongAccount:true}});
 const tx=await db.bankTransaction.findFirstOrThrow({where:{sourceId:"wrong"}});
 await enqueuePush(db,[{key:"resolved",kind:"wrongAccount",transactionId:tx.id}]);await db.bankTransaction.update({where:{id:tx.id},data:{assignment:"MANUAL",matchReason:"Resolved"}});await dispatchAdminPush();assert.equal(sent.length,2,"resolved alerts discarded");
 await enqueuePush(db,[{key:"revoked",kind:"syncError"}]);process.env.ADMIN_EMAILS="";await dispatchAdminPush();assert.equal(sent.length,2,"removed admins cannot receive");process.env.ADMIN_EMAILS=pref.email;
 await enqueuePush(db,[{key:"expired",kind:"syncError"}]);status=410;await dispatchAdminPush();assert.equal(await db.adminPushSubscription.count({where:{id:sub.id}}),0,"expired subscriptions removed");
 console.log("PASS: ingestion, preference isolation, dedupe, batching, retry, resolved alerts, revoked admin, expired subscription");
}finally{
 await db.pushPreference.deleteMany();await db.bankTransaction.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();await db.syncLease.deleteMany({where:{id:"admin-push"}});await db.$disconnect();
}
