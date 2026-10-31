import {test} from "node:test";
import assert from "node:assert/strict";
import {parseSourceBalance,balanceProfiles} from "../src/lib/source-balance";
const response=(data:Record<string,unknown>={})=>({status:200,data:{username:balanceProfiles["0572"].username,userId:balanceProfiles["0572"].userId,accountNumber:"0572",totalCredit:6513293984,totalDebit:6340200285,...data}});
test("statement API totals match displayed website totals, preserve money and validate identity",()=>{
 const result=parseSourceBalance(response(),"0572");assert.equal(result.balance,173093699n);assert.equal(result.updatedAt,null,"API does not supply a balance update time");
 assert.equal(parseSourceBalance(response({totalCredit:"900719925474099312",totalDebit:"12345"}),"0572").balance,900719925474086967n);
 assert.equal(parseSourceBalance(response({totalCredit:100,totalDebit:200}),"0572").balance,-100n);
 for(const raw of [response({accountNumber:"0856"}),response({userId:"WRONG"}),response({username:"WRONG"}),response({totalCredit:1.5}),response({totalDebit:-1}),response({totalCredit:Number.MAX_SAFE_INTEGER+1}),response({totalDebit:null}),{status:500},"<script id=__NEXT_DATA__>old profile</script>"])assert.throws(()=>parseSourceBalance(raw,"0572"));
});
