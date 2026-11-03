import type {Prisma} from "@/generated/prisma/client";
export function fundMembership(fundId:string|null):Prisma.BankTransactionWhereInput{
 return fundId?{OR:[{fundId,allocations:{none:{}}},{allocations:{some:{fundId}}}]}:{fundId:null,allocations:{none:{}}};
}
export function fundShare(row:{amount:bigint;fundId:string|null;allocations:{fundId:string;amount:bigint}[]},fundId:string){
 return row.allocations.length?row.allocations.find(a=>a.fundId===fundId)?.amount??0n:row.fundId===fundId?row.amount:0n;
}

/** Display-only membership. Never use this to calculate balances or authorize moving money. */
export function fundDisplayMembership(fundId:string):Prisma.BankTransactionWhereInput{
 return {OR:[fundMembership(fundId),{allocationTransfers:{some:{transfer:{OR:[{fromFundId:fundId},{toFundId:fundId}]}}}}]};
}
export function transferTrailSelect(fundId:string){return {
 where:{transfer:{OR:[{fromFundId:fundId},{toFundId:fundId}]}},
 select:{amount:true,transfer:{select:{id:true,fromFundId:true,toFundId:true,fromFund:{select:{code:true}},toFund:{select:{code:true}},createdAt:true,reason:true,reversalOf:true,reversal:{select:{id:true}}}}},
 orderBy:{transfer:{createdAt:"asc" as const}},
};}
type TrailItem={amount:bigint;transfer:{id:string;fromFundId:string;toFundId:string;fromFund:{code:string};toFund:{code:string};createdAt:Date;reason:string;reversalOf:string|null;reversal:{id:string}|null}};
export function transferTrail(items:TrailItem[],fundId:string){return items.map(i=>({id:i.transfer.id,amount:i.amount.toString(),from:i.transfer.fromFund.code,to:i.transfer.toFund.code,received:i.transfer.toFundId===fundId,at:i.transfer.createdAt.toISOString(),reason:i.transfer.reason,reversal:!!i.transfer.reversalOf,reversed:!!i.transfer.reversal}));}
export type TransferTrail=ReturnType<typeof transferTrail>;
