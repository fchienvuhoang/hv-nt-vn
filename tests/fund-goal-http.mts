import assert from "node:assert/strict";
import {decodeAdmin} from "../src/lib/admin-codec";
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(!["localhost","127.0.0.1"].includes(url.hostname)||!url.pathname.startsWith("/hvntvn_test"))throw new Error("Require isolated test database");
const origin=process.env.QA_ORIGIN??"http://localhost:3003";
if(!origin.startsWith("http://localhost:"))throw new Error("Localhost only");
if(!process.env.AUTH_SECRET)throw new Error("QA secret required");
const {db}=await import("../src/lib/db");
const {encode}=await import("next-auth/jwt");
const token=await encode({token:{email:"qa-admin@example.test",name:"QA admin",sub:"qa"},secret:process.env.AUTH_SECRET,salt:"authjs.session-token",maxAge:3600});
async function save(values:Record<string,string>){const body=new FormData();for(const [k,v]of Object.entries(values))body.set(k,v);const response=await fetch(origin+"/api/admin/funds",{method:values.id?"PUT":"POST",headers:{Origin:origin,Cookie:`authjs.session-token=${token}`},body});assert.equal(response.status,200);return decodeAdmin<{success?:string;fieldErrors?:Record<string,string[]>}>(await response.json());}
if(await db.bankAccount.count())throw new Error("Require empty test DB");
try{
 await db.bankAccount.create({data:{number:"0572",owner:"QA",label:"QA"}});
 const input={code:"GOALTEST",name:"Quỹ kiểm tra mục tiêu",description:"",keywords:"",status:"ACTIVE",goalAmount:"100000000"};
 assert.ok((await save(input)).success);
 let fund=await db.fund.findUniqueOrThrow({where:{code:input.code}});assert.equal(fund.goalAmount,100000000n);
 const update={...input,id:fund.id};
 const privateNote="Ghi chú nội bộ\nCần đối chiếu nguồn";
 assert.ok((await save({...update,adminNote:privateNote})).success);
 assert.equal((await db.fund.findUniqueOrThrow({where:{id:fund.id}})).adminNote,privateNote);
 assert.ok((await save({...update,adminNote:"x".repeat(3001)})).fieldErrors?.adminNote);
 assert.ok((await save({...update,goalAmount:"999999999999999"})).success);
 assert.equal((await db.fund.findUniqueOrThrow({where:{id:fund.id}})).goalAmount,999999999999999n);
 for(const bad of ["-1","0","1.5","100,000","1000000000000000"]){assert.ok((await save({...update,goalAmount:bad})).fieldErrors?.goalAmount);assert.equal((await db.fund.findUniqueOrThrow({where:{id:fund.id}})).goalAmount,999999999999999n);}
 const {goalAmount:omitted,...legacy}=update;void omitted;assert.ok((await save(legacy)).success);
 assert.equal((await db.fund.findUniqueOrThrow({where:{id:fund.id}})).goalAmount,999999999999999n);
 const logs=await db.auditLog.findMany({where:{entityId:fund.id,action:"FUND_UPDATED"}});assert.ok(logs.some(l=>JSON.stringify(l.details).includes("999999999999999")));
 assert.ok((await save({...update,goalAmount:""})).success);
 fund=await db.fund.findUniqueOrThrow({where:{id:fund.id}});assert.equal(fund.goalAmount,null);
 assert.equal(fund.adminNote,privateNote,"omitting notes in older forms preserves the saved note");
 const publicResponse=await fetch(origin+"/api/public/funds/"+fund.slug);
 assert.equal(publicResponse.status,200);
 const publicText=await publicResponse.text();
 assert.ok(!publicText.includes("Ghi chú nội bộ")&&!publicText.includes("adminNote"),"private notes must not appear in the public API");
 assert.ok((await save({...update,adminNote:""})).success);
 assert.equal((await db.fund.findUniqueOrThrow({where:{id:fund.id}})).adminNote,"");
 assert.equal(await db.bankTransaction.count(),0);assert.equal(fund.openingIncome,0n);assert.equal(fund.openingExpense,0n);
 console.log("PASS: REST create/update/clear optional fund goal, exact large VND values, invalid input rejection, legacy form preservation, audit serialization, unchanged ledger");
}finally{await db.auditLog.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();await db.$disconnect();}
