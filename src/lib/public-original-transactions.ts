import "server-only";
import {unstable_cache} from "next/cache";
import type {Prisma} from "@/generated/prisma/client";
import {db} from "./db";
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
 return {OR:[{fundId,allocationTransfers:{none:{}}},{id:{in:ids}}]};
}
