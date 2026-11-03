import "server-only";
import type {Prisma} from "@/generated/prisma/client";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {fundTotals,serializable,type LedgerClient} from "./ledger";
import {fundMembership,fundShare} from "./allocation";
import {moveShares} from "./allocation-write";
import {actorStamp,type Actor} from "./actor";
import {fundUsesAccount,vnd} from "./domain";
import {transferBalanceError} from "./transfer-balance";
export class AllocationTransferError extends Error {
 readonly allocationTransferError=true;
 constructor(message:string){super(message);this.name="AllocationTransferError";}
}
// Next may load this module through both the action and route bundles.
export function isAllocationTransferError(error:unknown):error is AllocationTransferError {
 return error instanceof AllocationTransferError||!!(error&&typeof error==="object"&&"allocationTransferError" in error&&error.allocationTransferError===true&&"message" in error&&typeof error.message==="string");
}
const id=z.string().min(1).max(100),money=z.string().regex(/^\d{1,15}$/).transform(BigInt);
const planSchema=z.object({fromFundId:id,toFundId:id,accountId:id.optional(),mode:z.enum(["AMOUNT","TARGET_INCOME"]),value:money,reason:z.string().trim().min(5).max(1000)});
export type AllocationTransferInput=z.input<typeof planSchema>;
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function plan(tx:LedgerClient,input:AllocationTransferInput){
 const data=planSchema.parse(input);if(data.fromFundId===data.toFundId)throw new AllocationTransferError("Hai thiện pháp phải khác nhau");
 const totals=await fundTotals(tx),source=totals.find(f=>f.id===data.fromFundId),destination=totals.find(f=>f.id===data.toFundId);
 if(!source||!destination)throw new AllocationTransferError("Không tìm thấy thiện pháp");
 const sourceIncome=source.income+source.transferIn-source.transferOut+source.openingTransferNet,destinationIncome=destination.income+destination.transferIn-destination.transferOut+destination.openingTransferNet;
 const amount=data.mode==="AMOUNT"?data.value:sourceIncome-data.value;
 const balanceError=transferBalanceError(source.byAccount,amount,data.accountId);
 if(balanceError)throw new AllocationTransferError(balanceError);
 if(amount<=0n)throw new AllocationTransferError("Số tiền điều chuyển phải lớn hơn 0; mức thành tựu phải nhỏ hơn tổng hùn phước hiện tại.");
 const budgets=new Map(source.byAccount.filter(a=>!data.accountId||a.accountId===data.accountId).map(a=>[a.accountId,a.balance>0n?a.balance:0n]));
 const rows=await tx.bankTransaction.findMany({omit:{source:true,sourceHash:true},where:{AND:[fundMembership(source.id),{direction:"CREDIT",entryStatus:"POSTED",...(data.accountId?{accountId:data.accountId}:{})}]},include:{allocations:true,account:{select:{number:true}}},orderBy:[{occurredAt:"desc"},{id:"desc"}]});
 let remaining=amount;
 const items:{transactionId:string;updatedAt:string;accountId:string;accountNumber:string;refId:string;narrative:string;displayName:string;at:string;originalAmount:string;sourceBefore:string;sourceAfter:string;destinationBefore:string;destinationAfter:string;amount:string;split:boolean}[]=[];
 for(const row of rows){
  if(!remaining)break;
  const available=fundShare(row,source.id),budget=budgets.get(row.accountId)??0n;
  if(!budget||!available)continue;
  if(!fundUsesAccount(destination,row.accountId))throw new AllocationTransferError("Thiện pháp nhận không hỗ trợ tài khoản của giao dịch");
  const take=[available,budget,remaining].reduce((a,b)=>a<b?a:b),toBefore=fundShare(row,destination.id);
  if(take<=0n)continue;
  items.push({transactionId:row.id,updatedAt:row.updatedAt.toISOString(),accountId:row.accountId,accountNumber:row.account.number,refId:row.refId,narrative:row.narrative,displayName:row.displayName,at:row.occurredAt.toISOString(),originalAmount:row.amount.toString(),sourceBefore:available.toString(),sourceAfter:(available-take).toString(),destinationBefore:toBefore.toString(),destinationAfter:(toBefore+take).toString(),amount:take.toString(),split:take<available});
  remaining-=take;budgets.set(row.accountId,budget-take);
 }
 const balanceItems:{accountId:string;accountNumber:string;amount:string;sourceBefore:string;sourceAfter:string;destinationBefore:string;destinationAfter:string}[]=[];
 if(remaining){
  const accounts=await tx.bankAccount.findMany({select:{id:true,number:true}});
  for(const [accountId,budget]of budgets){
   if(!remaining)break;
   if(budget<=0n||!fundUsesAccount(destination,accountId))continue;
   const take=budget<remaining?budget:remaining;
   const sourceBefore=source.byAccount.find(a=>a.accountId===accountId)!.balance-items.filter(i=>i.accountId===accountId).reduce((n,i)=>n+BigInt(i.amount),0n);
   const destinationBefore=(destination.byAccount.find(a=>a.accountId===accountId)?.balance??0n)+items.filter(i=>i.accountId===accountId).reduce((n,i)=>n+BigInt(i.amount),0n);
   balanceItems.push({accountId,accountNumber:accounts.find(a=>a.id===accountId)!.number,amount:take.toString(),sourceBefore:sourceBefore.toString(),sourceAfter:(sourceBefore-take).toString(),destinationBefore:destinationBefore.toString(),destinationAfter:(destinationBefore+take).toString()});
   remaining-=take;
  }
 }
 if(remaining)throw new AllocationTransferError("Không đủ số dư trong các tài khoản mà thiện pháp nhận hỗ trợ. Hãy kiểm tra phạm vi tài khoản.");
 const result={fromFundId:source.id,toFundId:destination.id,fromCode:source.code,toCode:destination.code,fromName:source.name,toName:destination.name,amount:amount.toString(),incomeBefore:sourceIncome.toString(),incomeAfter:(sourceIncome-amount).toString(),destinationIncomeAfter:(destinationIncome+amount).toString(),sourceBalanceBefore:source.balance.toString(),sourceBalanceAfter:(source.balance-amount).toString(),destinationBalanceBefore:destination.balance.toString(),destinationBalanceAfter:(destination.balance+amount).toString(),items,balanceItems};
 return {...result,fingerprint:hash({input:{...data,value:data.value.toString()},plan:result})};
}
export type AllocationTransferPreview=Awaited<ReturnType<typeof plan>>;
export async function previewAllocationTransfer(input:AllocationTransferInput){return serializable(tx=>plan(tx,input))}
export async function commitAllocationTransfer(input:AllocationTransferInput&{requestId:string;fingerprint:string},actor:Actor){
 const requestId=z.string().uuid().parse(input.requestId),fingerprint=z.string().length(64).parse(input.fingerprint),data=planSchema.parse(input);
 const requestKey=hash({...data,value:data.value.toString(),fingerprint});
 return serializable(async tx=>{
  const previous=await tx.transfer.findUnique({where:{requestId}});
  if(previous){if(previous.mode!=="ALLOCATION"||previous.requestKey!==requestKey||previous.actor!==actorStamp(actor).actor)throw new AllocationTransferError("Mã yêu cầu đã dùng cho thao tác khác");return previous}
  const preview=await plan(tx,input);if(preview.fingerprint!==fingerprint)throw new AllocationTransferError("Giao dịch hoặc số liệu đã thay đổi sau khi xem trước. Chưa chuyển khoản nào; hãy kiểm tra lại.");
  const accountIds=[...new Set([...preview.items,...preview.balanceItems].map(i=>i.accountId))];
  const transfer=await tx.transfer.create({data:{requestId,fromFundId:data.fromFundId,toFundId:data.toFundId,accountId:accountIds.length===1?accountIds[0]:null,amount:BigInt(preview.amount),reason:data.reason,mode:"ALLOCATION",targetIncome:data.mode==="TARGET_INCOME"?data.value:null,requestKey,planFingerprint:fingerprint,...actorStamp(actor)}});
  const roots=await tx.bankTransaction.findMany({where:{id:{in:preview.items.map(i=>i.transactionId)}},include:{allocations:true}});
  const changes=await moveShares(tx,preview.items.map(item=>({row:roots.find(r=>r.id===item.transactionId)!,from:data.fromFundId,to:data.toFundId,amount:BigInt(item.amount)})),actor);
  if(preview.balanceItems.length)await tx.transferBalanceItem.createMany({data:preview.balanceItems.map(item=>({...item,transferId:transfer.id,amount:BigInt(item.amount),sourceBefore:BigInt(item.sourceBefore),sourceAfter:BigInt(item.sourceAfter),destinationBefore:BigInt(item.destinationBefore),destinationAfter:BigInt(item.destinationAfter)}))});
  await tx.transferItem.createMany({data:preview.items.map((item,index)=>({transferId:transfer.id,transactionId:item.transactionId,amount:BigInt(item.amount),originalAmount:BigInt(item.originalAmount),...changes[index],snapshot:item}))});
  await tx.transactionNote.createMany({data:preview.items.map(item=>({requestId:`${requestId}:${item.transactionId}`,transactionId:item.transactionId,text:`Quản trị viên điều chuyển ${vnd(item.amount)} từ ${preview.fromCode} sang ${preview.toCode} trên giao dịch gốc ${vnd(item.originalAmount)}. Phần còn tại ${preview.fromCode}: ${vnd(item.sourceAfter)}; phần tại ${preview.toCode}: ${vnd(item.destinationAfter)}. ${item.split?"Giao dịch được tách phân bổ, giữ nguyên giao dịch ngân hàng gốc. ":""}Lý do: ${data.reason}`,kind:"ALLOCATION_TRANSFER",...actorStamp(actor)}))});
  await tx.auditLog.create({data:{action:"ALLOCATION_TRANSFER_CREATED",entityId:transfer.id,...actorStamp(actor),details:{amount:preview.amount,from:preview.fromCode,to:preview.toCode,count:preview.items.length,balanceItems:preview.balanceItems,targetIncome:transfer.targetIncome?.toString()??null,reason:data.reason}}});
  return transfer;
 });
}
export async function reverseAllocationTransfer(tx:LedgerClient,original:{id:string;amount:bigint;fromFundId:string;toFundId:string;accountId:string|null},reason:string,actor:Actor){
 const items=await tx.transferItem.findMany({where:{transferId:original.id},include:{transaction:{include:{allocations:true}}}});
 const balanceItems=await tx.transferBalanceItem.findMany({where:{transferId:original.id}});
 if(!items.length&&!balanceItems.length)throw new AllocationTransferError("Không tìm thấy chi tiết các khoản đã điều chuyển");
 const totals=await fundTotals(tx),source=totals.find(f=>f.id===original.toFundId)!,destination=totals.find(f=>f.id===original.fromFundId)!;
 const required=new Map<string,bigint>();for(const item of items)required.set(item.transaction.accountId,(required.get(item.transaction.accountId)??0n)+item.amount);
 for(const item of balanceItems)required.set(item.accountId,(required.get(item.accountId)??0n)+item.amount);
 const balanceError=transferBalanceError(source.byAccount,original.amount);
 if(balanceError)throw new AllocationTransferError("Thiện pháp nhận không còn đủ số dư khả dụng để đảo; không thể làm âm thiện pháp nguồn.");
 for(const [accountId,amount]of required)if((source.byAccount.find(a=>a.accountId===accountId)?.balance??0n)<amount)throw new AllocationTransferError("Thiện pháp nhận không còn đủ số dư trong tài khoản gốc để đảo");
 for(const item of items)if(item.transaction.entryStatus!=="POSTED"||item.transaction.direction!=="CREDIT"||fundShare(item.transaction,source.id)<item.amount)throw new AllocationTransferError("Phần tiền đã được chuyển tiếp hoặc thay đổi; không thể đảo lượt này. Hãy đảo các lượt sau trước.");
 const reversal=await tx.transfer.create({data:{requestId:randomUUID(),accountId:original.accountId,fromFundId:source.id,toFundId:destination.id,amount:original.amount,reason,mode:"ALLOCATION",reversalOf:original.id,...actorStamp(actor)}});
 if(balanceItems.length)await tx.transferBalanceItem.createMany({data:balanceItems.map(item=>{const detailed=items.filter(i=>i.transaction.accountId===item.accountId).reduce((n,i)=>n+i.amount,0n),from=source.byAccount.find(a=>a.accountId===item.accountId)!.balance-detailed,to=(destination.byAccount.find(a=>a.accountId===item.accountId)?.balance??0n)+detailed;return {transferId:reversal.id,accountId:item.accountId,accountNumber:item.accountNumber,amount:item.amount,sourceBefore:from,sourceAfter:from-item.amount,destinationBefore:to,destinationAfter:to+item.amount}})});
 const changes=await moveShares(tx,items.map(item=>({row:item.transaction,from:source.id,to:destination.id,amount:item.amount})),actor);
 await tx.transferItem.createMany({data:items.map((item,index)=>({transferId:reversal.id,transactionId:item.transactionId,amount:item.amount,originalAmount:item.transaction.amount,...changes[index],snapshot:item.snapshot as Prisma.InputJsonValue}))});
 await tx.transactionNote.createMany({data:items.map(item=>({requestId:`${reversal.requestId}:${item.transactionId}`,transactionId:item.transactionId,text:`Quản trị viên đảo điều chuyển ${vnd(item.amount)} từ ${source.code} về ${destination.code}, khôi phục phần phân bổ của giao dịch gốc. Lý do: ${reason}`,kind:"ALLOCATION_REVERSAL",...actorStamp(actor)}))});
 await tx.auditLog.create({data:{action:"ALLOCATION_TRANSFER_REVERSED",entityId:reversal.id,...actorStamp(actor),details:{originalId:original.id,reason}}});
 return reversal;
}
