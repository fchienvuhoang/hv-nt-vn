import "server-only";
import {unstable_cache} from "next/cache";
import {Prisma} from "@/generated/prisma/client";
import {db} from "./db";
import {originalFundShare} from "./transaction-split-input";
import type {LedgerClient} from "./ledger";
import {publicFundTag} from "./cache-tags";
/** Public receipts stay with the fund that held them before their first transfer.
 * Admin and accounting continue to use the current allocation, not this display scope.
 */
export async function publicOriginalMembership(fundId:string):Promise<Prisma.BankTransactionWhereInput>{
 const ids=await unstable_cache(async()=>{
  const rows=await db.$queryRaw<{transactionId:string}[]>`
   SELECT "transactionId" FROM (
    SELECT DISTINCT ON (i."transactionId") i."transactionId",t."fromFundId"
    FROM "TransferItem" i JOIN "Transfer" t ON t.id=i."transferId"
    WHERE t."reversalOf" IS NULL AND i."transactionId" IN (
     SELECT candidate."transactionId" FROM "TransferItem" candidate JOIN "Transfer" origin ON origin.id=candidate."transferId" WHERE origin."fromFundId"=${fundId}
    )
    ORDER BY i."transactionId",t."createdAt",t.id
   ) first_transfer WHERE "fromFundId"=${fundId}`;
  return rows.map(r=>r.transactionId);
 },["public-original-receipts-v1",fundId],{revalidate:false,tags:["public-ledger",publicFundTag(fundId)]})();
 return originalReceiptMembership(fundId,ids);
}

/** Sum each original share once, while keeping internal transfers out of receipt history. */
export async function originalReceiptTotals(client:LedgerClient,where:Prisma.BankTransactionWhereInput,fundId:string) {
 const [regular,split]=await Promise.all([
  client.bankTransaction.groupBy({by:["direction"],where:{AND:[where,{originalAllocations:{equals:Prisma.DbNull}}]},_sum:{amount:true},_count:true}),
  client.bankTransaction.findMany({where:{AND:[where,{originalAllocations:{not:Prisma.DbNull}}]},select:{direction:true,amount:true,originalAllocations:true}}),
 ]);
 return (["CREDIT","DEBIT"] as const).map(direction=>({direction,_sum:{amount:(regular.find(r=>r.direction===direction)?._sum.amount??0n)+split.filter(r=>r.direction===direction).reduce((n,r)=>n+originalFundShare(r,fundId),0n)},_count:(regular.find(r=>r.direction===direction)?._count??0)+split.filter(r=>r.direction===direction).length}));
}

export function originalReceiptMembership(fundId:string,ids:string[]=[]):Prisma.BankTransactionWhereInput {
 return {OR:[{originalAllocations:{array_contains:[{fundId}]}},{AND:[{originalAllocations:{equals:Prisma.DbNull}},{OR:[{fundId,allocationTransfers:{none:{}}},{id:{in:ids}}]}]}]};
}
