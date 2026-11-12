"use server";
import { splitTransaction } from "@/lib/transaction-split";
import type { TransactionSplitInput } from "@/lib/transaction-split-input";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { appendTransactionNote, reassignTransactions, fundTransactionList, type BulkReassignment } from "@/lib/transaction-management";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdminActor } from "@/lib/auth";
import { actorStamp, createdStamp, updatedStamp, type Actor } from "@/lib/actor";
import { serializable } from "@/lib/ledger";
import { validateFundKeywords, FundKeywordError } from "@/lib/fund-keywords";
import { startTabReclassification, advanceTabReclassification, latestTabReclassification, type ReclassificationScope } from "@/lib/reclassify";
import {invalidateMutation} from "@/lib/admin-mutation-scope";
import {commitAllocationTransfer,type AllocationTransferInput} from "@/lib/allocation-transfers";
import { transferFunds, reverseFundTransfer } from "@/lib/transfers";
import {
  listFundImports,
  stageFundImport,
  processFundImport,
  type FundImportSummary,
} from "@/lib/fund-imports";
import { reviewEntry } from "@/lib/review-entry";
import type { Prisma } from "@/generated/prisma/client";
export type ActionState = { error?: string; success?: string; fieldErrors?: Record<string, string[]> };
const id = z.string().min(1).max(100);
const money = z
  .string()
  .regex(/^\d{1,15}$/, "Số tiền phải là số nguyên VND, không có dấu phân cách")
  .transform(BigInt);
const status = z.enum(["ACTIVE", "PAUSED", "COMPLETED"]);
const reason = z.string().trim().min(5, "Lý do cần ít nhất 5 ký tự").max(1000);
const code = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z][A-Z0-9]{1,29}$/,
        "Mã gồm 2–30 chữ cái/số, bắt đầu bằng chữ",
      ),
  );
const fundSchema = z.object({
  recognitionEnabled: z.enum(["1","0"]).optional().transform(v=>v===undefined?undefined:v==="1"),
  recognitionTitle: z.string().trim().max(100).optional(),
  recognitionAmount: z.union([z.literal("").transform(()=>null),money.refine(value=>value>0n,"Mức cổ phần phải lớn hơn 0")]).optional(),
  publicListed: z.enum(["1","0"]).optional().transform(v=>v===undefined?undefined:v==="1"),
  code,
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().max(3000),
  adminNote: z.string().trim().transform(value=>value.replace(/\r\n?/g,"\n")).pipe(z.string().max(3000,"Ghi chú tối đa 3.000 ký tự")).optional(),
  goalAmount: z.union([z.literal("").transform(()=>null),money.refine(value=>value>0n,"Mục tiêu phải lớn hơn 0")]).optional(),
  sourceUrl: z.string().trim().max(2000).refine(value => !value || (URL.canParse(value) && ["https:", "http:"].includes(new URL(value).protocol)), "Link phải bắt đầu bằng https:// hoặc http://").optional(),
  keywords: z.string().max(3000),
  status,
});
function refresh() {
  revalidatePath("/admin", "layout");
  invalidateMutation();
}
async function execute(
  fn: (actor: Actor) => Promise<string>,
): Promise<ActionState> {
  const actor = await requireAdminActor();
  try {
    const message = await fn(actor);
    refresh();
    return { success: message };
  } catch (error) {
    if (error instanceof FundKeywordError) return { fieldErrors: error.fieldErrors };
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of error.issues) { const key = String(issue.path[0] ?? "form"); (fieldErrors[key] ??= []).push(issue.message); }
      return { error: error.issues.map((i) => i.message).join("; "), fieldErrors };
    }
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "P2002")
        return {
          error:
            "Mã hoặc yêu cầu này đã tồn tại. Vui lòng tải lại trang để kiểm tra.",
        };
      console.error("Database action failed", error.code);
      return {
        error:
          "Không thể lưu dữ liệu. Vui lòng thử lại hoặc kiểm tra kết nối cơ sở dữ liệu.",
      };
    }
    return {
      error:
        error instanceof Error ? error.message : "Không thể thực hiện thao tác",
    };
  }
}
async function audit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  entityId: string,
  details: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({ data: { ...actorStamp(actor), action, entityId, details } });
}
export async function setFundVisibility(_state: ActionState, form: FormData) {
  return execute(async actor=>{
    const data=z.object({fundId:id,visible:z.enum(["1","0"])}).parse(Object.fromEntries(form));
    await serializable(async tx=>{
      const fund=await tx.fund.findUniqueOrThrow({where:{id:data.fundId}}),publicListed=data.visible==="1";
      if(fund.publicListed===publicListed)return;
      await tx.fund.update({where:{id:fund.id},data:{publicListed,...updatedStamp(actor)}});
      await audit(tx,actor,publicListed?"Hiển thị trên trang Minh bạch":"Ẩn khỏi trang Minh bạch",fund.id,{code:fund.code,name:fund.name,before:fund.publicListed,after:publicListed});
    });
    return data.visible==="1"?"Đã bật hiển thị trên trang Minh bạch. Thiện pháp cần đang hoạt động để xuất hiện.":"Đã ẩn thiện pháp khỏi trang Minh bạch.";
  });
}
export async function pinFund(_state: ActionState, form: FormData) {
  return execute(async actor=>{
    const data=z.object({fundId:id,pinned:z.enum(["1","0"])}).parse(Object.fromEntries(form));
    await serializable(async tx=>{
      const fund=await tx.fund.findUniqueOrThrow({where:{id:data.fundId}});
      if(Boolean(fund.pinnedAt)===(data.pinned==="1"))return;
      const pinnedAt=data.pinned==="1"?new Date():null;
      await tx.fund.update({where:{id:fund.id},data:{pinnedAt,...updatedStamp(actor)}});
      await audit(tx,actor,data.pinned==="1"?"Ghim thiện pháp":"Bỏ ghim thiện pháp",fund.id,{code:fund.code,name:fund.name,before:fund.pinnedAt?.toISOString()??null,after:pinnedAt?.toISOString()??null});
    });
    return data.pinned==="1"?"Đã ghim thiện pháp lên đầu danh sách.":"Đã bỏ ghim thiện pháp.";
  });
}
export async function saveFund(_state: ActionState, form: FormData) {
  return execute(async (actor) => {
    const data = fundSchema.parse(Object.fromEntries(form));
    const fundId = form.get("id")?.toString();
    await serializable(async (tx) => {
      const accounts = await tx.bankAccount.findMany({ orderBy: { number: "asc" } });
      if (!accounts.length) throw new Error("Chưa cấu hình tài khoản sao kê");
      const existing = fundId ? await tx.fund.findUniqueOrThrow({ where: { id: fundId } }) : null;
      // The primary ID is retained solely for legacy totals and stable public URLs.
      // Preserve configured account scope; new ordinary funds use both accounts.
      const accountId = existing?.accountId ?? accounts[0].id;
      const account = accounts.find(a => a.id === accountId)!;
      // Reading every fund in the serializable transaction also protects against
      // concurrent creates/edits claiming the same normalized keyword.
      const rules = await tx.fund.findMany({ select: { id: true, code: true, name: true, keywords: true } });
      const recognitionEnabled=data.recognitionEnabled??existing?.recognitionEnabled??false;
      const recognitionTitle=data.recognitionTitle??existing?.recognitionTitle??"Cổ phần";
      const recognitionAmount=data.recognitionAmount===undefined?existing?.recognitionAmount??null:data.recognitionAmount;
      if(recognitionEnabled&&(!recognitionTitle||!recognitionAmount))throw new Error("Khi bật phương danh, cần nhập tên cổ phần và giá trị một cổ phần lớn hơn 0.");
      const fields = {
        ...data, recognitionEnabled,recognitionTitle,recognitionAmount, publicListed: data.publicListed ?? existing?.publicListed ?? false, accountId,
        sourceUrl: data.sourceUrl ?? existing?.sourceUrl ?? "",
        adminNote: data.adminNote ?? existing?.adminNote ?? "",
        goalAmount: data.goalAmount === undefined ? existing?.goalAmount ?? null : data.goalAmount,
        accountIds: [...new Set(existing?.accountIds ?? accounts.map(a => a.id))].filter(id => id !== accountId),
        keywords: validateFundKeywords(data.code, data.keywords, rules, fundId),
      };
      if (fundId) {
        const before = await tx.fund.findUniqueOrThrow({
          where: { id: fundId },
        });
        await tx.fund.update({ where: { id: fundId }, data: { ...fields, ...updatedStamp(actor) } });
        await audit(tx, actor, "FUND_UPDATED", fundId, {
          before: {
            code: before.code,
            name: before.name,
            keywords: before.keywords,
            status: before.status,
            description: before.description,
            sourceUrl: before.sourceUrl,
            adminNote: before.adminNote,
            goalAmount: before.goalAmount?.toString() ?? null,
            publicListed: before.publicListed,
            recognitionEnabled:before.recognitionEnabled,recognitionTitle:before.recognitionTitle,recognitionAmount:before.recognitionAmount?.toString()??null,
          },
          after: { ...fields, goalAmount: fields.goalAmount?.toString() ?? null, recognitionAmount: fields.recognitionAmount?.toString()??null },
        });
      } else {
        const created = await tx.fund.create({
          data: {
            ...fields, ...createdStamp(actor), ...updatedStamp(actor),
            slug: `${account.number}-${data.code.toLowerCase()}`,
          },
        });
        await audit(tx, actor, "FUND_CREATED", created.id, { ...fields, goalAmount: fields.goalAmount?.toString() ?? null, recognitionAmount: fields.recognitionAmount?.toString()??null });
      }
    });
    return "Đã lưu thiện pháp. Giao dịch cũ không bị tự động phân loại lại.";
  });
}
export async function assignTransaction(_state: ActionState, form: FormData) {
  return execute(async (actor) => {
    const values = z
      .object({ transactionId: id, fundId: id, reason,sourceFundId:id.optional() })
      .parse(Object.fromEntries(form));
    const transaction=await db.bankTransaction.findUniqueOrThrow({where:{id:values.transactionId}});
    await reassignTransactions({requestId:randomUUID(),sourceFundId:values.sourceFundId??transaction.fundId,targetFundId:values.fundId,reason:values.reason,rows:[{id:transaction.id,updatedAt:transaction.updatedAt.toISOString()}]},actor);
    return "Đã gán giao dịch bằng tay và lưu lịch sử.";
  });
}
export async function startReclassification(input: ReclassificationScope) {
  const actor = await requireAdminActor();
  try { return { run: await startTabReclassification(input, actor) }; }
  catch (error) { return { error: importError(error) }; }
}
export async function advanceReclassification(input: { id: string; phase: "CHECK" | "APPLY" }) {
  const actor = await requireAdminActor();
  try {
    const values = z.object({ id, phase: z.enum(["CHECK","APPLY"]) }).parse(input);
    const run = await advanceTabReclassification(values.id,values.phase,actor);
    if (values.phase === "APPLY") {
      invalidateMutation();
      if (run.status === "COMPLETE" || run.status === "STALE") revalidatePath("/admin", "layout");
    }
    return { run };
  } catch (error) { return { error: importError(error) }; }
}
export async function createAllocationTransfer(input:AllocationTransferInput&{requestId:string;fingerprint:string}){
 return execute(async actor=>{await commitAllocationTransfer(input,actor);return "Đã điều chuyển đúng số tiền, lưu các phần tách và ghi chú công khai.";});
}
export async function createTransfer(_state: ActionState, form: FormData) {
  return execute(async (actor) => {
    const input = z
      .object({
        requestId: z.string().uuid(),
        fromFundId: id,
        toFundId: id,
        accountId: id.optional(),
        amount: money.refine((n) => n > 0n, "Số tiền phải lớn hơn 0"),
        reason,
      })
      .parse(Object.fromEntries(form));
    await transferFunds(input, actor);
    return "Đã điều chuyển và ghi lịch sử. Tổng hùn phước không thay đổi.";
  });
}
export async function reverseTransfer(_state: ActionState, form: FormData) {
  return execute(async (actor) => {
    const input = z
      .object({ transferId: id, reason })
      .parse(Object.fromEntries(form));
    await reverseFundTransfer(input.transferId, input.reason, actor);
    return "Đã tạo bút toán đảo; lịch sử gốc được giữ nguyên.";
  });
}
export type ExcelUploadState = {
  error?: string;
  batches?: FundImportSummary[];
};
function importError(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues.map((i) => i.message).join("; ");
  if (error && typeof error === "object" && "code" in error)
    return "Không thể xử lý dữ liệu. Vui lòng thử lại hoặc kiểm tra kết nối cơ sở dữ liệu.";
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "Không thể nhập file Excel";
}
export async function uploadFundExcel(
  _state: ExcelUploadState,
  form: FormData,
): Promise<ExcelUploadState> {
  const actor = await requireAdminActor();
  try {
    const fundId = id.parse(form.get("fundId"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Chọn file Excel cần nhập");
    return { batches: await stageFundImport(fundId, file, actor,{latestMonthOnly:form.get("latestMonthOnly")!=="0"}) };
  } catch (error) {
    return { error: importError(error) };
  }
}
export async function commitFundExcel(input: {
  batchId: string;
  replaceLegacy: boolean;
  acceptMismatch: boolean;
}): Promise<{ error?: string; batch?: FundImportSummary }> {
  const actor = await requireAdminActor();
  try {
    const values = z
      .object({
        batchId: id,
        replaceLegacy: z.boolean(),
        acceptMismatch: z.boolean(),
      })
      .parse(input);
    const batch = await processFundImport(values, actor);
    if (batch.status === "COMPLETE") refresh();
    else invalidateMutation();
    return { batch };
  } catch (error) {
    return { error: importError(error) };
  }
}
export async function resolveDuplicate(_state: ActionState, form: FormData) {
  return execute(async (actor) => {
    const values = z
      .object({
        id,
        decision: z.enum(["SEPARATE", "MERGE"]),
        targetId: id.optional(),
        fundId: id.optional(),
        reason,
      })
      .parse({
        id: form.get("transactionId"),
        decision: form.get("decision"),
        targetId: form.get("targetId") || undefined,
        fundId: form.get("fundId") || undefined,
        reason: form.get("reason"),
      });
    await reviewEntry(values, actor);
    return "Đã kiểm tra và cập nhật tổng tiền. Lịch sử nguồn được giữ nguyên.";
  });
}
export async function getFundImportHistory(fundId: string): Promise<{history?:FundImportSummary[];error?:string}> {
  await requireAdminActor();
  try { return {history:await listFundImports(id.parse(fundId))}; }
  catch(error) { return {error:importError(error)}; }
}

export async function getFundTransactions(input:Parameters<typeof fundTransactionList>[0]) {
  await requireAdminActor();
  try { return {data:await fundTransactionList(input)}; }
  catch(error) { return {error:importError(error)}; }
}
export async function bulkAssignTransactions(input:BulkReassignment) {
  return execute(async actor=>{
    const result=await reassignTransactions(input,actor);
    return `Đã gán ${result.count} giao dịch và ghi lý do công khai cho từng khoản.`;
  });
}
export async function saveTransactionNote(_state:ActionState,form:FormData) {
  return execute(async actor=>{
    await appendTransactionNote({requestId:form.get("requestId")?.toString()??"",transactionId:form.get("transactionId")?.toString()??"",text:form.get("text")?.toString()??""},actor);
    return "Đã lưu ghi chú công khai và lịch sử người thực hiện.";
  });
}
export async function addTransactionNote(input:{requestId:string;transactionId:string;text:string}) {
  return execute(async actor=>{await appendTransactionNote(input,actor);return "Đã thêm ghi chú công khai.";});
}

export async function getLatestReclassification(scope:ReclassificationScope) {
  const actor=await requireAdminActor();
  try { return {run:await latestTabReclassification(scope,actor)}; }
  catch(error) { return {error:importError(error)}; }
}

export async function splitBankTransaction(input:TransactionSplitInput) {
  return execute(async actor=>{
    const result=await splitTransaction(input,actor);
    return `Đã chia giao dịch cho ${result.count} thiện pháp, giữ nguyên số tiền ngân hàng gốc.`;
  });
}


export async function saveRecognitionName(input:unknown){
 return execute(async actor=>{
   const data=z.object({fundId:id,transactionId:id,name:z.string().trim().max(200,"Tên phương danh tối đa 200 ký tự")}).parse(input);
   const {publicOriginalMembership}=await import("@/lib/public-original-transactions");
   const {originalFundShare}=await import("@/lib/transaction-split-input");
   await serializable(async tx=>{
     const fund=await tx.fund.findUniqueOrThrow({where:{id:data.fundId}});
     if(!fund.recognitionEnabled||!fund.recognitionAmount)throw new Error("Thiện pháp chưa bật cấu hình cổ phần.");
     const membership=await publicOriginalMembership(fund.id);
     const entry=await tx.bankTransaction.findFirst({where:{AND:[membership,{id:data.transactionId,direction:"CREDIT",entryStatus:"POSTED"}]},select:{amount:true,originalAllocations:true}});
     if(!entry||originalFundShare(entry,fund.id)<fund.recognitionAmount)throw new Error("Giao dịch không còn đủ điều kiện ghi phương danh.");
     const before=await tx.fundRecognitionName.findUnique({where:{fundId_transactionId:{fundId:fund.id,transactionId:data.transactionId}}});
     await tx.fundRecognitionName.upsert({where:{fundId_transactionId:{fundId:fund.id,transactionId:data.transactionId}},create:data,update:{name:data.name}});
     await audit(tx,actor,"RECOGNITION_NAME_UPDATED",data.transactionId,{fundId:fund.id,before:before?.name??"",after:data.name});
   });
   return "Đã lưu tên ghi phương danh. Sao kê gốc không thay đổi.";
 });
}
