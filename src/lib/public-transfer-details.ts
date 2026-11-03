import "server-only";
import {db} from "./db";
import {maskPhones} from "./domain";
/** Explicit public allowlist: never serialize Prisma snapshots, actor/email or raw bank payload. */
export async function loadPublicTransferDetails(slug:string,id:string){
 const row=await db.transfer.findFirst({where:{id,OR:[{fromFund:{slug}},{toFund:{slug}}]},include:{fromFund:{select:{code:true}},toFund:{select:{code:true}},reversal:{select:{id:true}},items:{include:{transaction:{select:{hiddenNarrative:true}}},orderBy:{id:"asc"}},balanceItems:{orderBy:{id:"asc"}}}});
 if(!row)return null;
 return {id:row.id,from:row.fromFund.code,to:row.toFund.code,amount:row.amount.toString(),reason:maskPhones(row.reason),at:row.createdAt.toISOString(),reversal:!!row.reversalOf,reversed:!!row.reversal,
  items:row.items.map(item=>{const snapshot=item.snapshot as Record<string,unknown>;return {id:item.id,account:typeof snapshot.accountNumber==="string"?snapshot.accountNumber:"",at:typeof snapshot.at==="string"?snapshot.at:null,narrative:item.transaction.hiddenNarrative?"Nội dung được ẩn theo nguồn sao kê":maskPhones(typeof snapshot.narrative==="string"?snapshot.narrative:""),originalAmount:item.originalAmount.toString(),amount:item.amount.toString(),sourceAfter:item.sourceAfter.toString(),destinationAfter:item.destinationAfter.toString()}}),
  balanceItems:row.balanceItems.map(item=>({id:item.id,account:item.accountNumber,amount:item.amount.toString(),sourceAfter:item.sourceAfter.toString(),destinationAfter:item.destinationAfter.toString()})),
 };
}
export type PublicTransferDetails=NonNullable<Awaited<ReturnType<typeof loadPublicTransferDetails>>>;
