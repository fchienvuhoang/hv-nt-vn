import assert from "node:assert/strict";
import {encode} from "next-auth/jwt";
const url=new URL(process.env.DATABASE_URL??"https://invalid");if(url.hostname!=="localhost"||!url.pathname.startsWith("/hvntvn_test"))throw Error("Isolated DB only");
const {db}=await import("../src/lib/db");const origin="http://localhost:3010",slug=`qa-admin-cache-${Date.now()}`;
const token=await encode({token:{email:"qa-admin@example.test",sub:"qa",name:"QA"},secret:process.env.AUTH_SECRET!,salt:"authjs.session-token",maxAge:600});
const account=await db.bankAccount.create({data:{number:slug,owner:"QA",label:"QA"}});
const fund=await db.fund.create({data:{accountId:account.id,code:slug,slug,name:"QA cache",openingIncome:100n}});
try{
 const get=async()=>{const r=await fetch(`${origin}/api/public/funds/${slug}`);assert.equal(r.status,200);return r.json()};
 assert.equal((await get()).goalIncome,"100");await db.fund.update({where:{id:fund.id},data:{openingIncome:200n}});assert.equal((await get()).goalIncome,"100");
 const post=(headers:Record<string,string>)=>fetch(origin+"/api/admin/public-cache",{method:"POST",headers});
 assert.equal((await post({origin})).status,401);
 assert.equal((await post({origin:"https://other.example",cookie:`authjs.session-token=${token}`})).status,403);
 const before={transfers:await db.transfer.count(),transactions:await db.bankTransaction.count(),emails:await db.fundGoalEmail.count()};
 const result=await post({origin,cookie:`authjs.session-token=${token}`});assert.equal(result.status,200);const data=await result.json();assert.ok(data.built>=1||data.busy);
 assert.equal((await get()).goalIncome,"200");
 assert.deepEqual({transfers:await db.transfer.count(),transactions:await db.bankTransaction.count(),emails:await db.fundGoalEmail.count()},before);
 console.log("PASS: admin-session cache refresh without SYNC_SECRET, reject anonymous/cross-origin, updated public totals, no financial writes or email queues");
}finally{await db.publicCacheRefresh.deleteMany({where:{fundId:fund.id}});await db.fund.delete({where:{id:fund.id}});await db.bankAccount.delete({where:{id:account.id}});await db.$disconnect()}
