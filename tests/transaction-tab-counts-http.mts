import assert from "node:assert/strict";
import {decodeAdmin} from "../src/lib/admin-codec";
const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");if(url.hostname!=="localhost"||!url.pathname.startsWith("/hvntvn_test"))throw new Error("QA DB only");
const {db}=await import("../src/lib/db"),{localDate,startOfVietnamDay}=await import("../src/lib/domain"),{encode}=await import("next-auth/jwt");if(await db.bankAccount.count())throw new Error("Empty DB required");if(!process.env.AUTH_SECRET)throw new Error("QA secret required");
const token=await encode({token:{email:"qa-admin@example.test",sub:"qa"},secret:process.env.AUTH_SECRET,salt:"authjs.session-token",maxAge:3600}),origin="http://localhost:3001";
try{
 const accounts=await Promise.all(["0572","0856"].map(number=>db.bankAccount.create({data:{number,owner:"TEST",label:"TEST"}}))),funds=await Promise.all(["COUNTA","COUNTB"].map(code=>db.fund.create({data:{code,slug:`qa-${code}`,name:`TEST ${code}`,keywords:[],accountId:accounts[0].id,accountIds:[accounts[1].id]}})));
 const today=localDate(),yesterday=localDate(new Date(startOfVietnamDay(today).getTime()-86400000));
 const entries=[{fund:0,day:today,account:0},{fund:0,day:yesterday,account:0},{fund:null,day:yesterday,account:0},{fund:null,day:today,account:1},{fund:1,day:today,account:1,debit:true},{fund:1,day:yesterday,account:1},{fund:0,day:today,account:0,merged:true},{fund:0,day:yesterday,account:0,split:true}];
 for(let i=0;i<entries.length;i++){const e=entries[i],row=await db.bankTransaction.create({data:{accountId:accounts[e.account].id,fundId:e.fund===null?null:funds[e.fund].id,sourceId:`COUNT-${i}`,refId:`COUNT-${i}`,amount:100n,direction:e.debit?"DEBIT":"CREDIT",entryStatus:e.merged?"MERGED":"POSTED",assignment:e.split?"MANUAL":"UNASSIGNED",narrative:`TEST ${i}`,displayName:"TEST",occurredAt:new Date(`${e.day}T10:00:00+07:00`),sourceHash:"TEST",source:{test:true}}});if(e.split)await db.fundAllocation.createMany({data:funds.map((f,j)=>({transactionId:row.id,fundId:f.id,accountId:row.accountId,amount:j===0?40n:60n}))})}
 type Data={total:number;pending:number;count:number;selectedTotal:number;range:{allTime:boolean};history:{fundId:string;count:number}[];rows:{amount:bigint}[]};
 async function get(params:Record<string,string>={}){const response=await fetch(`${origin}/api/admin/transactions?${new URLSearchParams(params)}`,{headers:{cookie:`authjs.session-token=${token}`}});assert.equal(response.status,200);const data=decodeAdmin<Data>(await response.json());assert.equal(data.total,7);assert.equal(data.pending,2);assert.equal(data.history.find(h=>h.fundId===funds[0].id)?.count,3);assert.equal(data.history.find(h=>h.fundId===funds[1].id)?.count,3);return data}
 const all=await get();assert.equal(all.count,7);assert.equal(all.selectedTotal,7);assert.equal(all.range.allTime,true);
 assert.equal((await get({from:today,to:today})).count,3);
 const pending=await get({pending:"1",from:today,to:today});assert.equal(pending.count,1);assert.equal(pending.selectedTotal,2);
 assert.equal((await get({pending:"1"})).count,2);
 const fund=await get({fund:funds[1].id,from:yesterday,to:yesterday,account:accounts[0].id});assert.equal(fund.count,1);assert.equal(fund.selectedTotal,3);assert.equal(fund.rows[0].amount,60n);
 assert.equal((await get({review:"merged",from:today,to:today})).count,1);assert.equal((await get({q:"NOTFOUND"})).count,0);
 assert.equal((await get({from:yesterday})).count,4);
 const {startTabReclassification}=await import("../src/lib/reclassify");
 const run=await startTabReclassification({tab:"PENDING",from:"",to:""},{email:"qa-admin@example.test",id:"qa",name:"QA"});assert.equal(run.total,2);
 console.log("PASS: global tab badges ignore all filters, all-time default, dated/pending/fund/account/search/merged filters only affect rows/count, split membership totals and single-day selection");
}finally{await db.tabReclassification.deleteMany();await db.auditLog.deleteMany();await db.bankTransaction.deleteMany();await db.fund.deleteMany();await db.bankAccount.deleteMany();await db.$disconnect()}
