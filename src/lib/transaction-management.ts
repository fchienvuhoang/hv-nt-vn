import "server-only";
import {fundMembership,fundShare} from "./allocation";
import {moveShares} from "./allocation-write";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { serializable } from "./ledger";
import { actorStamp, updatedStamp, type Actor } from "./actor";
import { fundUsesAccount,vnd } from "./domain";
const id=z.string().min(1).max(100);
const bulkSchema=z.object({requestId:z.string().uuid(),sourceFundId:id.nullable().optional(),targetFundId:id,reason:z.string().trim().min(5,"Lý do cần ít nhất 5 ký tự").max(1000),rows:z.array(z.object({id,updatedAt:z.string().datetime()})).min(1,"Chọn ít nhất một giao dịch").max(500,"Tối đa 500 giao dịch mỗi lần")});
export type BulkReassignment = z.input<typeof bulkSchema>;
export async function reassignTransactions(input:BulkReassignment,actor:Actor) {
  const values=bulkSchema.parse(input);
  if(new Set(values.rows.map(r=>r.id)).size!==values.rows.length)throw new Error("Danh sách giao dịch bị trùng");
  const fingerprint=createHash("sha256").update(JSON.stringify({...values,rows:[...values.rows].sort((a,b)=>a.id.localeCompare(b.id))})).digest("hex");
  return serializable(async tx=>{
    const previous=await tx.auditLog.findFirst({where:{action:"TRANSACTIONS_REASSIGNED",entityId:values.requestId}});
    if(previous){
      const details=previous.details as {fingerprint?:string;count?:number};
      if(details.fingerprint!==fingerprint||previous.actor!==actorStamp(actor).actor)throw new Error("Mã yêu cầu đã được dùng cho thao tác khác");
      return {count:details.count??values.rows.length};
    }
    const [target,source,rows]=await Promise.all([
      tx.fund.findUniqueOrThrow({where:{id:values.targetFundId}}),
      values.sourceFundId?tx.fund.findUniqueOrThrow({where:{id:values.sourceFundId}}):null,
      tx.bankTransaction.findMany({where:{id:{in:values.rows.map(r=>r.id)}},include:{allocations:true}}),
    ]);
    if(rows.length!==values.rows.length)throw new Error("Có giao dịch không còn tồn tại. Tải lại danh sách để kiểm tra.");
    const versions=new Map(values.rows.map(r=>[r.id,r.updatedAt]));
    for(const row of rows){
      if(row.entryStatus!=="POSTED"||(row.allocations.length?(!values.sourceFundId||fundShare(row,values.sourceFundId)<=0n):values.sourceFundId!==undefined&&row.fundId!==values.sourceFundId)||row.updatedAt.toISOString()!==versions.get(row.id))throw new Error("Có giao dịch vừa được sửa hoặc đổi thiện pháp. Chưa chuyển khoản nào; hãy tải lại và chọn lại.");
      if(!fundUsesAccount(target,row.accountId))throw new Error("Thiện pháp nhận không hỗ trợ tài khoản của giao dịch");
    }
    const sourceFunds=await tx.fund.findMany({where:{id:{in:[...new Set(rows.flatMap(r=>r.fundId?[r.fundId]:[]))]}},select:{id:true,code:true,name:true}});
    const sourceLabels=new Map(sourceFunds.map(f=>[f.id,`${f.code} (${f.name})`]));
    const text=source&&source.id!==target.id
      ?`Quản trị viên đã điều chuyển giao dịch từ ${source.code} (${source.name}) sang ${target.code} (${target.name}). Lý do: ${values.reason}`
      :`Quản trị viên đã gán giao dịch vào ${target.code} (${target.name}). Lý do: ${values.reason}`;
    const allocated=rows.filter(r=>r.allocations.length),regular=rows.filter(r=>!r.allocations.length);
    if(allocated.length)await moveShares(tx,allocated.map(row=>({row,from:values.sourceFundId!,to:target.id,amount:fundShare(row,values.sourceFundId!)})),actor);
    if(regular.length)await tx.bankTransaction.updateMany({where:{id:{in:regular.map(r=>r.id)}},data:{fundId:target.id,assignment:"MANUAL",matchReason:values.reason,...updatedStamp(actor)}});
    const publicText=(row:typeof rows[number])=>values.sourceFundId===undefined?`Quản trị viên đã gán giao dịch từ ${row.fundId?sourceLabels.get(row.fundId)??"thiện pháp cũ":"Chưa phân loại"} sang ${target.code} (${target.name}). Lý do: ${values.reason}`:row.allocations.length&&values.sourceFundId?`Quản trị viên đã điều chuyển phần hùn phước ${vnd(fundShare(row,values.sourceFundId))} từ ${source?.code??"thiện pháp nguồn"} sang ${target.code}, trên giao dịch gốc ${vnd(row.amount)}. Các phần khác của giao dịch được giữ nguyên. Lý do: ${values.reason}`:text;
    await tx.transactionNote.createMany({data:rows.map(row=>({requestId:`${values.requestId}:${row.id}`,transactionId:row.id,text:publicText(row),kind:"REASSIGNMENT",...actorStamp(actor)}))});
    await tx.auditLog.createMany({data:rows.map(row=>({...actorStamp(actor),action:"TRANSACTION_ASSIGNED",entityId:row.id,details:{requestId:values.requestId,previousFundId:row.fundId,previousAssignment:row.assignment,fundId:target.id,reason:values.reason,publicNote:publicText(row)}}))});
    await tx.auditLog.create({data:{...actorStamp(actor),action:"TRANSACTIONS_REASSIGNED",entityId:values.requestId,details:{fingerprint,count:rows.length,sourceFundId:values.sourceFundId??null,targetFundId:target.id,reason:values.reason}}});
    return {count:rows.length};
  });
}
const noteSchema=z.object({requestId:z.string().uuid(),transactionId:id,text:z.string().trim().min(3,"Ghi chú cần ít nhất 3 ký tự").max(2000)});
export async function appendTransactionNote(input:z.input<typeof noteSchema>,actor:Actor) {
  const values=noteSchema.parse(input);
  return serializable(async tx=>{
    const previous=await tx.transactionNote.findUnique({where:{requestId:values.requestId}});
    if(previous){
      if(previous.transactionId!==values.transactionId||previous.text!==values.text||previous.actor!==actorStamp(actor).actor)throw new Error("Mã ghi chú đã được sử dụng");
      return;
    }
    const row=await tx.bankTransaction.findUniqueOrThrow({where:{id:values.transactionId}});
    if(row.entryStatus!=="POSTED")throw new Error("Cần đối soát giao dịch nghi trùng trước khi thêm ghi chú công khai");
    const note=await tx.transactionNote.create({data:{...values,kind:"NOTE",...actorStamp(actor)}});
    await tx.bankTransaction.update({where:{id:row.id},data:updatedStamp(actor)});
    await tx.auditLog.create({data:{...actorStamp(actor),action:"TRANSACTION_NOTE_ADDED",entityId:row.id,details:{noteId:note.id,text:values.text}}});
  });
}
export async function fundTransactionList(input:{fundId:string;page?:number;q?:string;type?:string;account?:string}) {
  const fundId=id.parse(input.fundId),page=Math.max(1,Math.floor(input.page??1)),query=(input.q??"").trim().slice(0,100);
  const where={...fundMembership(fundId),entryStatus:"POSTED",...(input.type==="CREDIT"||input.type==="DEBIT"?{direction:input.type as "CREDIT"|"DEBIT"}:{}),...(input.account?{accountId:id.parse(input.account)}:{}),...(query?{OR:[{narrative:{contains:query,mode:"insensitive" as const}},{displayName:{contains:query,mode:"insensitive" as const}},{refId:{contains:query,mode:"insensitive" as const}},{notes:{some:{text:{contains:query,mode:"insensitive" as const}}}}]}:{})};
  const [rows,count]=await Promise.all([
    db.bankTransaction.findMany({where,include:{allocations:true,account:{select:{number:true}},notes:{orderBy:[{createdAt:"asc"},{id:"asc"}]}},orderBy:[{occurredAt:"desc"},{id:"desc"}],skip:(page-1)*100,take:100}),
    db.bankTransaction.count({where}),
  ]);
  return {page,count,rows:rows.map(r=>({id:r.id,amount:fundShare(r,fundId).toString(),direction:r.direction,narrative:r.narrative,displayName:r.displayName,refId:r.refId,at:r.occurredAt.toISOString(),account:r.account.number,accountId:r.accountId,updatedAt:r.updatedAt.toISOString(),notes:r.notes.map(n=>({id:n.id,text:n.text,actor:n.actorName??n.actor,at:n.createdAt.toISOString()}))}))};
}
export type FundTransactionList = Awaited<ReturnType<typeof fundTransactionList>>;
