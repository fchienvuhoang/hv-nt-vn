"use server";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { serializable } from "@/lib/ledger";
import { classify, normalize, fundUsesAccount } from "@/lib/domain";
import { PUBLIC_TAG } from "@/lib/public-data";
import { synchronize } from "@/lib/sync";
import { transferFunds, reverseFundTransfer } from "@/lib/transfers";
import {
  stageFundImport,
  processFundImport,
  type FundImportSummary,
} from "@/lib/fund-imports";
import { reviewEntry } from "@/lib/review-entry";
import { saveSyncStart } from "@/lib/sync-settings";
import type { Prisma } from "@/generated/prisma/client";
export type ActionState = { error?: string; success?: string };
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
  accountId: id,
  code,
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().max(3000),
  keywords: z.string().max(3000),
  status,
});
const keywordList = (value: string) => [
  ...new Set(
    value
      .split(/[\n;,]/)
      .map(normalize)
      .filter(Boolean),
  ),
];
function refresh() {
  revalidatePath("/admin", "layout");
  revalidateTag(PUBLIC_TAG, { expire: 0 });
}
async function execute(
  fn: (actor: string) => Promise<string>,
): Promise<ActionState> {
  const actor = await requireAdmin();
  try {
    const message = await fn(actor);
    refresh();
    return { success: message };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { error: error.issues.map((i) => i.message).join("; ") };
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
  actor: string,
  action: string,
  entityId: string,
  details: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({ data: { actor, action, entityId, details } });
}
export async function saveFund(_state: ActionState, form: FormData) {
  return execute(async (actor) => {
    const data = fundSchema.parse(Object.fromEntries(form));
    const fundId = form.get("id")?.toString();
    const requestedAccounts = [
      ...new Set([
        data.accountId,
        ...z.array(id).max(50).parse(form.getAll("accountIds")),
      ]),
    ];
    await serializable(async (tx) => {
      const account = await tx.bankAccount.findUniqueOrThrow({
        where: { id: data.accountId },
      });
      if (
        (await tx.bankAccount.count({
          where: { id: { in: requestedAccounts } },
        })) !== requestedAccounts.length
      )
        throw new Error("Có tài khoản nhận tiền không tồn tại");
      const fields = {
        ...data,
        accountIds: requestedAccounts.filter((a) => a !== data.accountId),
        keywords: keywordList(data.keywords),
      };
      const sameCodes = await tx.fund.findMany({
        where: { code: data.code, ...(fundId ? { id: { not: fundId } } : {}) },
      });
      if (
        sameCodes.some((f) =>
          requestedAccounts.some((a) => fundUsesAccount(f, a)),
        )
      )
        throw new Error("Mã thiện pháp đã tồn tại trong một tài khoản đã chọn");
      if (
        fundId &&
        (await tx.bankTransaction.findFirst({
          where: { fundId, accountId: { notIn: requestedAccounts } },
          select: { id: true },
        }))
      )
        throw new Error(
          "Không thể bỏ tài khoản đã có giao dịch của thiện pháp",
        );
      if (fundId) {
        const before = await tx.fund.findUniqueOrThrow({
          where: { id: fundId },
        });
        if (before.accountId !== data.accountId)
          throw new Error("Không thể đổi tài khoản của thiện pháp");
        await tx.fund.update({ where: { id: fundId }, data: fields });
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
            ...fields,
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
      .object({ transactionId: id, fundId: id, reason })
      .parse(Object.fromEntries(form));
    await serializable(async (tx) => {
      const [transaction, fund] = await Promise.all([
        tx.bankTransaction.findUniqueOrThrow({
          where: { id: values.transactionId },
        }),
        tx.fund.findUniqueOrThrow({ where: { id: values.fundId } }),
      ]);
      if (transaction.entryStatus !== "POSTED")
        throw new Error(
          "Cần xử lý giao dịch nghi trùng trước khi đổi phân loại",
        );
      if (!fundUsesAccount(fund, transaction.accountId))
        throw new Error("Chỉ được gán vào thiện pháp cùng tài khoản sao kê");
      await tx.bankTransaction.update({
        where: { id: transaction.id },
        data: {
          fundId: fund.id,
          assignment: "MANUAL",
          matchReason: values.reason,
        },
      });
      await audit(tx, actor, "TRANSACTION_ASSIGNED", transaction.id, {
        previousFundId: transaction.fundId,
        previousAssignment: transaction.assignment,
        fundId: fund.id,
        reason: values.reason,
      });
    });
    return "Đã gán giao dịch bằng tay và lưu lịch sử.";
  });
}
export async function reclassifyPending() {
  return execute(async (actor) => {
    const count = await serializable(async (tx) => {
      const [rules, rows] = await Promise.all([
        tx.fund.findMany(),
        tx.bankTransaction.findMany({
          where: {
            assignment: "UNASSIGNED",
            fundId: null,
            entryStatus: "POSTED",
          },
          take: 500,
          orderBy: { occurredAt: "desc" },
        }),
      ]);
      let count = 0;
      for (const row of rows) {
        const match = classify(row.narrative, row.accountId, rules);
        if (!match.fundId) continue;
        await tx.bankTransaction.update({
          where: { id: row.id },
          data: {
            fundId: match.fundId,
            assignment: "AUTO",
            matchReason: match.reason,
          },
        });
        count++;
        await audit(tx, actor, "TRANSACTION_RECLASSIFIED", row.id, {
          fundId: match.fundId,
          reason: match.reason,
        });
      }
      return count;
    });
    return `Đã phân loại ${count} giao dịch trong tối đa 500 giao dịch chờ mới nhất.`;
  });
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
  const actor = await requireAdmin();
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
  const actor = await requireAdmin();
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
