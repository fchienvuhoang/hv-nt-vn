import assert from "node:assert/strict";
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(url.hostname!=="localhost"||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Isolated QA DB required");
const {db}=await import("../src/lib/db");const {describeFundChange,loadFundHistory}=await import("../src/lib/fund-history");
if(await db.bankAccount.count())throw new Error("Empty QA DB required");
try{
 const diff=describeFundChange("FUND_UPDATED",{before:{code:"TP1",name:"Old",keywords:["TP1","OLD","KEEP"],status:"ACTIVE",description:""},after:{code:"TP2",name:"New",keywords:["TP2","NEW","KEEP"],status:"PAUSED",description:"Changed"}});
 assert.deepEqual(diff.added,["TP2","NEW"]);assert.deepEqual(diff.removed,["TP1","OLD"]);assert.equal(diff.changes.length,4);assert.ok(diff.changes.some(c=>c.field==="Trạng thái"&&c.before==="Đang hoạt động"&&c.after==="Tạm dừng"));
 const noChange=describeFundChange("FUND_UPDATED",{before:{keywords:["A","B"],code:"TP1"},after:{keywords:["B","A"],code:"TP1"}});assert.equal(noChange.changes.length+noChange.added.length+noChange.removed.length,0);
 assert.deepEqual(describeFundChange("FUND_CREATED",{keywords:["ONE","TWO"]}).added,["ONE","TWO"]);
 const a=await db.bankAccount.create({data:{number:"0572",owner:"TEST",label:"TEST"}}),f=await db.fund.create({data:{code:"TP1",slug:"qa-history",name:"TEST",keywords:[],accountId:a.id}});
 await db.auditLog.createMany({data:Array.from({length:32},(_,i)=>({entityId:f.id,action:"FUND_UPDATED",actor:"qa@example.test",actorId:"qa-id",actorName:"QA Admin",createdAt:new Date(1700000000000+i*1000),details:{before:{keywords:["OLD"]},after:{keywords:[`NEW${i}`]}}}))});
 await db.auditLog.create({data:{entityId:f.id,action:"TRANSACTION_ASSIGNED",actor:"TEST",details:{}}});
 const first=await loadFundHistory(f.id);assert.equal(first.total,32);assert.equal(first.rows.length,30);assert.equal(first.rows[0].actorId,"qa-id");assert.equal(first.rows[0].actorName,"QA Admin");assert.deepEqual(first.rows[0].added,["NEW31"]);assert.deepEqual(first.rows[0].removed,["OLD"]);
 const second=await loadFundHistory(f.id,2);assert.equal(second.rows.length,2);assert.deepEqual(second.rows[1].added,["NEW0"]);
 await assert.rejects(loadFundHistory("missing"));
 console.log("PASS: historical before/after keyword additions/removals, reorder/no-op, creation, field changes, actor identity, chronological pagination, fund/action isolation");
}finally{await db.auditLog.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();await db.$disconnect()}
