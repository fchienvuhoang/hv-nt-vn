"use server";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializable } from "@/lib/ledger";
import { classify, localDate, normalize, openingBalance, startOfVietnamDay } from "@/lib/domain";
import { PUBLIC_TAG } from "@/lib/public-data";
import { synchronize } from "@/lib/sync";
import { transferFunds, reverseFundTransfer } from "@/lib/transfers";
import { parseCsv } from "@/lib/csv";
import type { Prisma } from "@/generated/prisma/client";
export type ActionState = { error?: string; success?: string };
const id = z.string().min(1).max(100);
const money = z.string().regex(/^\d{1,15}$/, "Số tiền phải là số nguyên VND, không có dấu phân cách").transform(BigInt);
const signedMoney = z.string().regex(/^-?\d{1,15}$/, "Số tiền phải là số nguyên VND").transform(BigInt);
const status = z.enum(["ACTIVE", "PAUSED", "COMPLETED"]);
const reason = z.string().trim().min(5, "Lý do cần ít nhất 5 ký tự").max(1000);
const code = z.string().trim().transform(s => s.toUpperCase()).pipe(z.string().regex(/^[A-Z][A-Z0-9]{1,29}$/, "Mã gồm 2–30 chữ cái/số, bắt đầu bằng chữ"));
const fundSchema = z.object({ accountId: id, code, name: z.string().trim().min(3).max(200), description: z.string().trim().max(3000), keywords: z.string().max(3000), status });
const keywordList = (value: string) => [...new Set(value.split(/[\n;,]/).map(normalize).filter(Boolean))];
function refresh() {
  revalidatePath("/admin", "layout");
  revalidateTag(PUBLIC_TAG, { expire: 0 });
}
async function execute(fn: (actor: string) => Promise<string>): Promise<ActionState> {
  const actor = await requireAdmin();
  try { const message = await fn(actor); refresh(); return { success: message }; }
  catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues.map(i => i.message).join("; ") };
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "P2002") return { error: "Mã hoặc yêu cầu này đã tồn tại. Vui lòng tải lại trang để kiểm tra." };
      console.error("Database action failed", error.code);
      return { error: "Không thể lưu dữ liệu. Vui lòng thử lại hoặc kiểm tra kết nối cơ sở dữ liệu." };
    }
    return { error: error instanceof Error ? error.message : "Không thể thực hiện thao tác" };
  }
}
async function audit(tx: Prisma.TransactionClient, actor: string, action: string, entityId: string, details: Prisma.InputJsonValue) {
  await tx.auditLog.create({ data: { actor, action, entityId, details } });
}
export async function saveFund(_state: ActionState, form: FormData) {
  return execute(async actor => {
    const data = fundSchema.parse(Object.fromEntries(form));
    const fundId = form.get("id")?.toString();
    await serializable(async tx => {
      const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: data.accountId } });
      const fields = { ...data, keywords: keywordList(data.keywords) };
      if (fundId) {
        const before = await tx.fund.findUniqueOrThrow({ where: { id: fundId } });
        if (before.accountId !== data.accountId) throw new Error("Không thể đổi tài khoản của thiện pháp");
        await tx.fund.update({ where: { id: fundId }, data: fields });
        await audit(tx, actor, "FUND_UPDATED", fundId, { before: { code: before.code, name: before.name, keywords: before.keywords, status: before.status, description: before.description }, after: fields });
      } else {
        const created = await tx.fund.create({ data: { ...fields, slug: `${account.number}-${data.code.toLowerCase()}` } });
        await audit(tx, actor, "FUND_CREATED", created.id, fields);
      }
    });
    return "Đã lưu thiện pháp. Giao dịch cũ không bị tự động phân loại lại.";
  });
}
export async function assignTransaction(_state: ActionState, form: FormData) {
  return execute(async actor => {
    const values = z.object({ transactionId: id, fundId: id, reason }).parse(Object.fromEntries(form));
    await serializable(async tx => {
      const [transaction, fund] = await Promise.all([tx.bankTransaction.findUniqueOrThrow({ where: { id: values.transactionId } }), tx.fund.findUniqueOrThrow({ where: { id: values.fundId } })]);
      if (transaction.accountId !== fund.accountId) throw new Error("Chỉ được gán vào thiện pháp cùng tài khoản sao kê");
      await tx.bankTransaction.update({ where: { id: transaction.id }, data: { fundId: fund.id, assignment: "MANUAL", matchReason: values.reason } });
      await audit(tx, actor, "TRANSACTION_ASSIGNED", transaction.id, { previousFundId: transaction.fundId, previousAssignment: transaction.assignment, fundId: fund.id, reason: values.reason });
    });
    return "Đã gán giao dịch bằng tay và lưu lịch sử.";
  });
}
export async function reclassifyPending() {
  return execute(async actor => {
    const count = await serializable(async tx => {
      const [rules, rows] = await Promise.all([tx.fund.findMany(), tx.bankTransaction.findMany({ where: { assignment: "UNASSIGNED", fundId: null }, take: 500, orderBy: { occurredAt: "desc" } })]);
      let count = 0;
      for (const row of rows) {
        const match = classify(row.narrative, row.accountId, rules);
        if (!match.fundId) continue;
        await tx.bankTransaction.update({ where: { id: row.id }, data: { fundId: match.fundId, assignment: "AUTO", matchReason: match.reason } }); count++;
        await audit(tx, actor, "TRANSACTION_RECLASSIFIED", row.id, { fundId: match.fundId, reason: match.reason });
      }
      return count;
    });
    return `Đã phân loại ${count} giao dịch trong tối đa 500 giao dịch chờ mới nhất.`;
  });
}
export async function saveOpeningAccount(_state: ActionState, form: FormData) {
  return execute(async actor => {
    const input = z.object({ accountId: id, cutover: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), openingBankBalance: money, openingUnallocated: signedMoney, differenceReason: z.string().trim().max(1000) }).parse(Object.fromEntries(form));
    const at = startOfVietnamDay(input.cutover);
    if (!Number.isFinite(at.getTime()) || localDate(at) !== input.cutover || input.cutover > localDate()) throw new Error("Ngày bắt đầu phải hợp lệ và không ở tương lai");
    await serializable(async tx => {
      const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: input.accountId } });
      if (account.finalizedAt) throw new Error("Sổ đầu kỳ đã khóa, không thể sửa");
      await tx.bankAccount.update({ where: { id: account.id }, data: { cutoverAt: at, openingBankBalance: input.openingBankBalance, openingUnallocated: input.openingUnallocated, differenceReason: input.differenceReason } });
      await audit(tx, actor, "OPENING_ACCOUNT_SAVED", account.id, { cutover: input.cutover, bankBalance: input.openingBankBalance.toString(), unallocated: input.openingUnallocated.toString(), reason: input.differenceReason });
    });
    return "Đã lưu bản nháp. Kiểm tra số liệu rồi xác nhận khóa sổ.";
  });
}
export async function saveOpeningFund(_state: ActionState, form: FormData) {
  return execute(async actor => {
    const input = z.object({ fundId: id, openingIncome: money, openingExpense: money, openingTransferNet: signedMoney }).parse(Object.fromEntries(form));
    await serializable(async tx => {
      const fund = await tx.fund.findUniqueOrThrow({ where: { id: input.fundId }, include: { account: true } });
      if (fund.account.finalizedAt) throw new Error("Sổ đầu kỳ đã khóa");
      const { fundId, ...values } = input;
      await tx.fund.update({ where: { id: fundId }, data: values });
      await audit(tx, actor, "OPENING_FUND_SAVED", fund.id, { income: values.openingIncome.toString(), expense: values.openingExpense.toString(), transferNet: values.openingTransferNet.toString() });
    });
    return "Đã lưu số liệu lịch sử của thiện pháp.";
  });
}
export async function importOpeningCsv(_state: ActionState, form: FormData) {
  return execute(async actor => {
    const accountId = id.parse(form.get("accountId"));
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 1_000_000) throw new Error("Chọn file CSV tối đa 1 MB");
    const rows = parseCsv(await file.text());
    if (!rows.length || rows.length > 500) throw new Error("File cần có 1–500 thiện pháp");
    const schema = z.object({ code, name: z.string().trim().min(3).max(200), status, keywords: z.string().max(3000), openingIncome: money, openingExpense: money, openingTransferNet: signedMoney });
    const parsed = rows.map(row => schema.parse(row));
    if (new Set(parsed.map(r => r.code)).size !== parsed.length) throw new Error("File có mã thiện pháp trùng");
    await serializable(async tx => {
      const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
      if (account.finalizedAt) throw new Error("Sổ đầu kỳ đã khóa");
      for (const row of parsed) {
        const data = { ...row, keywords: keywordList(row.keywords) };
        await tx.fund.upsert({ where: { accountId_code: { accountId, code: row.code } }, create: { ...data, accountId, slug: `${account.number}-${row.code.toLowerCase()}` }, update: data });
      }
      await audit(tx, actor, "OPENING_CSV_IMPORTED", accountId, { count: parsed.length, codes: parsed.map(r => r.code), filename: file.name });
    });
    return `Đã nhập ${parsed.length} thiện pháp vào bản nháp. Mã đã có được cập nhật, không cộng dồn.`;
  });
}
export async function finalizeOpening(_state: ActionState, form: FormData) {
  return execute(async actor => {
    const accountId = id.parse(form.get("accountId"));
    if (form.get("confirmed") !== "yes") throw new Error("Cần xác nhận đã kiểm tra số dư ngân hàng và Sheets");
    await serializable(async tx => {
      const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: accountId }, include: { funds: true } });
      if (account.finalizedAt || !account.cutoverAt) throw new Error("Tài khoản đã khóa hoặc chưa lưu ngày bắt đầu");
      const allocated = account.funds.reduce((n,f) => n + openingBalance(f), 0n);
      const difference = account.openingBankBalance - allocated - account.openingUnallocated;
      if (difference !== 0n && account.differenceReason.length < 5) throw new Error("Có chênh lệch đầu kỳ: cần lưu lý do ít nhất 5 ký tự trước khi khóa sổ");
      await tx.bankAccount.update({ where: { id: accountId }, data: { openingDifference: difference, finalizedAt: new Date() } });
      await audit(tx, actor, "OPENING_FINALIZED", accountId, { bankBalance: account.openingBankBalance.toString(), funds: allocated.toString(), unallocated: account.openingUnallocated.toString(), difference: difference.toString(), reason: account.differenceReason, cutover: account.cutoverAt.toISOString() });
    });
    return "Đã khóa sổ đầu kỳ. Tài khoản sẵn sàng đồng bộ và xuất hiện công khai.";
  });
}
export async function createTransfer(_state: ActionState, form: FormData) {
  return execute(async actor => {
    const input = z.object({ requestId: z.string().uuid(), fromFundId: id, toFundId: id, amount: money.refine(n => n > 0n, "Số tiền phải lớn hơn 0"), reason }).parse(Object.fromEntries(form));
    await transferFunds(input, actor);
    return "Đã điều chuyển và ghi lịch sử. Tổng hùn phước không thay đổi.";
  });
}
export async function reverseTransfer(_state: ActionState, form: FormData) {
  return execute(async actor => {
    const input = z.object({ transferId: id, reason }).parse(Object.fromEntries(form));
    await reverseFundTransfer(input.transferId, input.reason, actor);
    return "Đã tạo bút toán đảo; lịch sử gốc được giữ nguyên.";
  });
}
export async function syncNow() {
  return execute(async actor => {
    try {
      const result = await synchronize(actor);
      return `Đã xử lý ${result.pages} trang: ${result.inserted} mới, ${result.updated} cập nhật.${result.pending ? " Còn dữ liệu, tiếp tục ở lượt sau." : " Đã hoàn tất."}`;
    } finally { refresh(); }
  });
}
