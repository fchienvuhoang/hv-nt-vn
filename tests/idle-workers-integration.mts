import assert from "node:assert/strict";
const url=new URL(process.env.DATABASE_URL??"https://invalid");if(url.hostname!=="localhost"||!url.pathname.startsWith("/hvntvn_test"))throw Error("Isolated QA DB only");
process.env.RESEND_API_KEY="test";process.env.NOTIFICATION_EMAIL_FROM="qa@example.test";process.env.VAPID_PUBLIC_KEY="qa";process.env.VAPID_PRIVATE_KEY="qa";process.env.VAPID_SUBJECT="https://example.test";
const {db}=await import("../src/lib/db");const {runPublicRefresh}=await import("../src/lib/public-snapshot");const {dispatchAdminNotificationsSafely}=await import("../src/lib/fund-goal-notifications");const {dispatchMorningReports}=await import("../src/lib/morning-report");
const account=await db.bankAccount.create({data:{number:"IDLE-QA",owner:"QA",label:"QA"}});
const fund=await db.fund.create({data:{accountId:account.id,code:"IDLE-QA",name:"QA",slug:"idle-qa"}});
const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date());
await db.publicCacheRefresh.create({data:{fundId:fund.id,requestedVersion:1,builtVersion:1,dailyKey:day}});
const execute=db.$executeRaw,transaction=db.$transaction;let writes=0,transactions=0;
try{
 db.$executeRaw=(()=>{writes++;throw Error("Idle worker attempted a write/lock");}) as typeof db.$executeRaw;
 db.$transaction=(()=>{transactions++;throw Error("Idle notification attempted a goal scan");}) as typeof db.$transaction;
 assert.deepEqual(await runPublicRefresh(),{busy:false,built:0,pending:0});
 await dispatchAdminNotificationsSafely({checkGoals:false});
 await dispatchMorningReports(new Date("2026-11-03T00:00:00+07:00"));
 assert.equal(writes,0);assert.equal(transactions,0);
 console.log("PASS idle queues do not acquire/write leases or rescan fund totals; morning preflight is valid");
}finally{db.$executeRaw=execute;db.$transaction=transaction;await db.publicCacheRefresh.delete({where:{fundId:fund.id}});await db.fund.delete({where:{id:fund.id}});await db.bankAccount.delete({where:{id:account.id}});await db.$disconnect();}
