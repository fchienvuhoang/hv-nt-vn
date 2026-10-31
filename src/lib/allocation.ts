import type {Prisma} from "@/generated/prisma/client";
export function fundMembership(fundId:string|null):Prisma.BankTransactionWhereInput{
 return fundId?{OR:[{fundId,allocations:{none:{}}},{allocations:{some:{fundId}}}]}:{fundId:null,allocations:{none:{}}};
}
export function fundShare(row:{amount:bigint;fundId:string|null;allocations:{fundId:string;amount:bigint}[]},fundId:string){
 return row.allocations.length?row.allocations.find(a=>a.fundId===fundId)?.amount??0n:row.fundId===fundId?row.amount:0n;
}
