"use server";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { appendTransactionNote, reassignTransactions, fundTransactionList, type BulkReassignment } from "@/lib/transaction-management";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdminActor } from "@/lib/auth";
import { actorStamp, createdStamp, updatedStamp, type Actor } from "@/lib/actor";
import { serializable } from "@/lib/ledger";
import { validateFundKeywords, FundKeywordError } from "@/lib/fund-keywords";
import { startTabReclassification, advanceTabReclassification, latestTabReclassification, type ReclassificationScope } from "@/lib/reclassify";
import { PUBLIC_TAG } from "@/lib/public-data";
import { synchronize } from "@/lib/sync";
import {commitAllocationTransfer,type AllocationTransferInput} from "@/lib/allocation-transfers";
import { transferFunds, reverseFundTransfer } from "@/lib/transfers";
import {
  listFundImports,
  stageFundImport,
  processFundImport,
  type FundImportSummary,
} from "@/lib/fund-imports";
import { reviewEntry } from "@/lib/review-entry";
import { saveSyncStart } from "@/lib/sync-settings";
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
  publicListed: z.enum(["1","0"]).optional().transform(v=>v===undefined?undefined:v==="1"),
  code,
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().max(3000),
  keywords: z.string().max(3000),
  status,
});
function refresh() {
  revalidatePath("/admin", "layout");
  revalidateTag(PUBLIC_TAG, { expire: 0 });
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
      // Neither posted form fields nor the UI can restrict a fund to one account.
      const accountId = existing?.accountId ?? accounts[0].id;
      const account = accounts.find(a => a.id === accountId)!;
      // Reading every fund in the serializable transaction also protects against
      // concurrent creates/edits claiming the same normalized keyword.
      const rules = await tx.fund.findMany({ select: { id: true, code: true, name: true, keywords: true } });
      const fields = {
        ...data, publicListed: data.publicListed ?? existing?.publicListed ?? false, accountId,
        accountIds: accounts.filter(a => a.id !== accountId).map(a => a.id),
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
          },
          after: fields,
        });
      } else {
        const created = await tx.fund.create({
          data: {
            ...fields, ...createdStamp(actor), ...updatedStamp(actor),
            slug: `${account.number}-${data.code.toLowerCase()}`,
          },
        });
        await audit(tx, actor, "FUND_CREATED", created.id, fields);
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
      revalidateTag(PUBLIC_TAG, { expire: 0 });
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
export async function syncNow() {
  return execute(async (actor) => {
    try {
      const result = await synchronize(actor);
      return `Đã xử lý ${result.pages} trang: ${result.inserted} mới, ${result.updated} cập nhật.${result.pending ? " Còn dữ liệu, tiếp tục ở lượt sau." : " Đã hoàn tất."}`;
    } finally {
      refresh();
    }
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
    return { batches: await stageFundImport(fundId, file, actor) };
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
    else revalidateTag(PUBLIC_TAG, { expire: 0 });
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
export async function configureSyncStart(_state: ActionState, form: FormData) {
  return execute(async (actor) => {
    const values = z
      .object({ accountId: id, from: z.string() })
      .parse(Object.fromEntries(form));
    await saveSyncStart(values.accountId, values.from, actor);
    return "Đã lưu ngày bắt đầu sao kê. Lượt sau sẽ quét lại theo ngày mới; giao dịch đã có được giữ và chống trùng.";
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
