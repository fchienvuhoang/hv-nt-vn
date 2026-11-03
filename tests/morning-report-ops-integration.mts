import assert from "node:assert/strict";
const url=new URL(process.env.DATABASE_URL??"https://invalid");if(url.hostname!=="localhost"||!url.pathname.startsWith("/hvntvn_test"))throw Error("QA DB required");
process.env.RESEND_API_KEY="qa";process.env.NOTIFICATION_EMAIL_FROM="qa@example.test";process.env.ADMIN_EMAILS="qa@example.test";
const {db}=await import("../src/lib/db");const {dispatchMorningReports}=await import("../src/lib/morning-report");const originalFetch=globalThis.fetch;let sent=0;
globalThis.fetch=async()=>{sent++;return Response.json({id:"qa-email"});};
try{
 await db.dailyReportSchedule.upsert({where:{id:"morning-7h"},create:{id:"morning-7h",activatedAt:new Date("2026-11-02T00:00:00Z")},update:{activatedAt:new Date("2026-11-02T00:00:00Z")}});
 await dispatchMorningReports(new Date("2026-11-03T06:59:00+07:00"));assert.equal(sent,0);
 await dispatchMorningReports(new Date("2026-11-03T07:00:00+07:00"));assert.equal(sent,1);assert.equal(await db.dailyReport.count({where:{date:"2026-11-03"}}),1);
 await dispatchMorningReports(new Date("2026-11-03T07:01:00+07:00"));assert.equal(sent,1);
 console.log("PASS morning preflight keeps exact 7h scheduling and does not resend completed report");
}finally{globalThis.fetch=originalFetch;await db.dailyReport.deleteMany();await db.dailyReportSchedule.deleteMany();await db.$disconnect();}
