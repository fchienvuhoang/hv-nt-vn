import "server-only";
import type {LedgerClient} from "./ledger";
import type {Actor} from "./actor";
import {updatedStamp} from "./actor";
import {fundShare} from "./allocation";
type Row={id:string;accountId:string;amount:bigint;fundId:string|null;allocations:{fundId:string;amount:bigint}[]};
type Move={row:Row;from:string;to:string;amount:bigint};
/** Batch all shares and metadata; never change original bank amounts or account IDs. */
export async function moveShares(tx:LedgerClient,moves:Move[],actor:Actor){
 if(!moves.length)return [];
 if(new Set(moves.map(m=>m.row.id)).size!==moves.length)throw new Error("Giao dịch điều chuyển bị trùng");
 const plans=moves.map(({row,from,to,amount})=>{
  const before=fundShare(row,from);if(amount<=0n||amount>before)throw new Error("Phần hùn phước nguồn không còn đủ. Vui lòng kiểm tra lại.");
  if(row.allocations.length&&row.allocations.reduce((n,a)=>n+a.amount,0n)!==row.amount)throw new Error("Phân bổ không khớp giao dịch gốc; cần kiểm tra trước khi điều chuyển.");
  const shares=new Map(row.allocations.length?row.allocations.map(a=>[a.fundId,a.amount]):[[from,row.amount]]);
  shares.set(from,before-amount);shares.set(to,(shares.get(to)??0n)+amount);
  const remaining=[...shares].filter(([,value])=>value>0n);
  return {row,remaining,details:{sourceBefore:before,sourceAfter:before-amount,destinationBefore:fundShare(row,to),destinationAfter:shares.get(to)??0n}};
 });
 await tx.fundAllocation.deleteMany({where:{transactionId:{in:plans.map(p=>p.row.id)}}});
 const allocations=plans.flatMap(p=>p.remaining.length>1?p.remaining.map(([fundId,amount])=>({transactionId:p.row.id,accountId:p.row.accountId,fundId,amount})):[]);
 if(allocations.length)await tx.fundAllocation.createMany({data:allocations});
 const groups=new Map<string,string[]>();
 for(const plan of plans){const key=plan.remaining.length===1?plan.remaining[0][0]:"";groups.set(key,[...(groups.get(key)??[]),plan.row.id])}
 for(const [fundId,ids]of groups)await tx.bankTransaction.updateMany({where:{id:{in:ids}},data:{...(fundId?{fundId}:{}),assignment:"MANUAL",...updatedStamp(actor)}});
 return plans.map(p=>p.details);
}
export async function moveShare(tx:LedgerClient,row:Row,from:string,to:string,amount:bigint,actor:Actor){return (await moveShares(tx,[{row,from,to,amount}],actor))[0]}
