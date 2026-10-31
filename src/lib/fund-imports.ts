import "server-only";
import { actorStamp, createdStamp, updatedStamp, type Actor } from "./actor";
import { db } from "./db";
import { serializable } from "./ledger";
import {
  importFileHash,
  readFundWorkbook,
  type ExcelEntry,
} from "./fund-excel";
import { chooseEntryMatch, ledgerMatchKey } from "./entry-matching";
import { localDate, startOfVietnamDay } from "./domain";
import type { Prisma } from "@/generated/prisma/client";
const select = {
  id: true,
  fundId: true,
  accountId: true,
  account: { select: { number: true, label: true } },
  fileName: true,
  sheetName: true,
  status: true,
  cursor: true,
  rowCount: true,
  skipped: true,
  added: true,
  matched: true,
  review: true,
  income: true,
  expense: true,
  sourceIncome: true,
  sourceExpense: true,
  sample: true,
  errors: true,
  createdAt: true,
} satisfies Prisma.FundImportSelect;
type Summary = Prisma.FundImportGetPayload<{ select: typeof select }>;
const dto = (b: Summary) => ({
  ...b,
  income: b.income.toString(),
  expense: b.expense.toString(),
  sourceIncome: b.sourceIncome?.toString() ?? null,
  sourceExpense: b.sourceExpense?.toString() ?? null,
  createdAt: b.createdAt.toISOString(),
  sample: b.sample as unknown as ExcelEntry[],
  errors: b.errors as string[],
});
export type FundImportSummary = ReturnType<typeof dto>;
export async function listFundImports(fundId: string) {
  return (
    await db.fundImport.findMany({
      where: { fundId },
      select,
      orderBy: { createdAt: "desc" },
      take: 20,
    })
  ).map(dto);
}
export async function stageFundImport(
  fundId: string,
  file: File,
  actor: Actor,
) {
  if (!/\.xlsx$/i.test(file.name) || file.size === 0 || file.size > 5_000_000)
    throw new Error(
      "Chọn file Excel .xlsx tối đa 5 MB. Với Google Sheets, tải xuống định dạng Microsoft Excel (.xlsx)",
    );
  if (
    !(await db.fund.findUnique({ where: { id: fundId }, select: { id: true } }))
  )
    throw new Error("Không tìm thấy thiện pháp");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    hash = importFileHash(bytes);
  const sheets = await readFundWorkbook(bytes, file.name);
  const fund = await db.fund.findUniqueOrThrow({ where: { id: fundId } });
  const accounts = await db.bankAccount.findMany();
  return serializable(async (tx) => {
  const result: FundImportSummary[] = [];
  for (const sheet of sheets) {
    const accountId = sheet.accountHint
      ? accounts.find((a) => a.number === sheet.accountHint)?.id
      : fund.accountId;
    if (!accountId)
      throw new Error(
        `Không tìm thấy tài khoản ${sheet.accountHint} của bảng ${sheet.name}`,
      );
    const batch = await tx.fundImport.upsert({
      where: {
        fundId_fileHash_sheetName: {
          fundId,
          fileHash: hash,
          sheetName: sheet.name,
        },
      },
      update: {},
      create: {
        fundId,
        accountId,
        fileHash: hash,
        sheetName: sheet.name,
        fileName: file.name.slice(0, 200),
        ...actorStamp(actor),
        rowCount: sheet.rows.length,
        skipped: sheet.skipped,
        income: BigInt(sheet.income),
        expense: BigInt(sheet.expense),
        sourceIncome:
          sheet.sourceIncome === null ? null : BigInt(sheet.sourceIncome),
        sourceExpense:
          sheet.sourceExpense === null ? null : BigInt(sheet.sourceExpense),
        sample: sheet.rows.slice(0, 5) as unknown as Prisma.InputJsonValue,
        errors: sheet.errors,
        data: sheet.rows as unknown as Prisma.InputJsonValue,
      },
      select,
    });
    await tx.auditLog.create({ data: { ...actorStamp(actor), action: "FUND_EXCEL_STAGED", entityId: fundId, details: { importId: batch.id, fileName: file.name, sheetName: sheet.name, rowCount: sheet.rows.length } } });
    result.push(dto(batch));
  }
  return result;
  });
}
export async function processFundImport(
  input: { batchId: string; replaceLegacy: boolean; acceptMismatch: boolean },
  actor: Actor,
) {
  return serializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "FundImport" WHERE id = ${input.batchId} FOR UPDATE`;
    const batch = await tx.fundImport.findUniqueOrThrow({
      where: { id: input.batchId },
      include: { fund: { include: { account: true } }, account: {select:{number:true,label:true}} },
    });
    if (batch.status === "COMPLETE") return dto(batch);
    if ((batch.errors as string[]).length)
      throw new Error(
        "File có dòng lỗi. Sửa các dòng được báo rồi tải lại trước khi nhập",
      );
    if (!batch.rowCount) throw new Error("File không có giao dịch hợp lệ");
    const mismatch =
      (batch.sourceIncome !== null && batch.sourceIncome !== batch.income) ||
      (batch.sourceExpense !== null && batch.sourceExpense !== batch.expense);
    if (mismatch && !input.acceptMismatch)
      throw new Error(
        "Tổng tính từ giao dịch khác dòng tổng trong file. Cần xác nhận sau khi kiểm tra",
      );
    const f = batch.fund;
    const accountId = batch.accountId ?? f.accountId;
    if (
      batch.cursor === 0 &&
      f.accountId !== accountId &&
      !f.accountIds.includes(accountId)
    ) {
      const collision = await tx.fund.findFirst({
        where: {
          id: { not: f.id },
          code: f.code,
          OR: [{ accountId }, { accountIds: { has: accountId } }],
        },
      });
      if (collision)
        throw new Error(
          `Mã ${f.code} đã có ở tài khoản của bảng này; chọn đúng thiện pháp trước khi nhập`,
        );
      await tx.fund.update({
        where: { id: f.id },
        data: { accountIds: { push: accountId }, ...updatedStamp(actor) },
      });
    }
    if (batch.cursor === 0) {
      const hasLegacy =
        accountId === f.accountId &&
        [f.openingIncome, f.openingExpense, f.openingTransferNet].some(
          (v) => v !== 0n,
        );
      if (hasLegacy && !input.replaceLegacy)
        throw new Error(
          "Thiện pháp có tổng lịch sử cũ. Xác nhận thay tổng cũ bằng chi tiết Excel để tránh cộng hai lần",
        );
      if (hasLegacy) {
        await tx.fund.update({
          where: { id: f.id },
          data: {
            ...updatedStamp(actor),
            openingIncome: 0n,
            openingExpense: 0n,
            openingTransferNet: 0n,
          },
        });
        await tx.auditLog.create({
          data: {
            ...actorStamp(actor),
            action: "LEGACY_SUMMARY_REPLACED",
            entityId: f.id,
            details: {
              importId: batch.id,
              income: f.openingIncome.toString(),
              expense: f.openingExpense.toString(),
              transferNet: f.openingTransferNet.toString(),
            },
          },
        });
      }
    }
    const rows = (batch.data as unknown as ExcelEntry[]).slice(
      batch.cursor,
      batch.cursor + 20,
    );
    let added = 0,
      matched = 0,
      review = 0;
    const previouslyMatched = await tx.bankTransaction.findMany({
      where: {
        importId: batch.id,
        entryStatus: "MERGED",
        mergedIntoId: { not: null },
      },
      select: { mergedIntoId: true },
    });
    const consumed = new Set(previouslyMatched.map((row) => row.mergedIntoId!));
    for (const row of rows) {
      const sourceId = `excel:${batch.id}:${row.row}`;
      if (
        await tx.bankTransaction.findUnique({
          where: { accountId_sourceId: { accountId, sourceId } },
          select: { id: true },
        })
      )
        continue;
      const at = new Date(row.at),
        amount = BigInt(row.amount),
        start = startOfVietnamDay(localDate(at));
      const pool = await tx.bankTransaction.findMany({
        where: {
          accountId,
          entryStatus: "POSTED",
          OR: [{importId:null},{importId:{not:batch.id}}],
          direction: row.direction,
          amount,
          occurredAt: { gte: start, lt: new Date(start.getTime() + 86400000) },
        },
        orderBy: { occurredAt: "desc" },
        take: 501,
      });
      const match = chooseEntryMatch(
        {
          direction: row.direction,
          amount,
          at,
          narrative: row.narrative,
          refId: row.refId,
        },
        pool,
      );
      if (match.exact && consumed.has(match.exact.id)) {
        match.suspected.push(match.exact);
        match.exact = null;
      }
      const conflict =
        match.exact?.fundId &&
        match.exact.fundId !== f.id &&
        match.exact.assignment === "MANUAL";
      const canMatch = match.exact && !conflict;
      const entryStatus = canMatch
        ? "MERGED"
        : match.suspected.length || conflict
          ? "REVIEW"
          : "POSTED";
      if (canMatch) {
        if (
          match.exact!.fundId !== f.id ||
          match.exact!.assignment !== "MANUAL"
        )
          await tx.bankTransaction.update({
            where: { id: match.exact!.id },
            data: {
              ...updatedStamp(actor),
              fundId: f.id,
              assignment: "MANUAL",
              matchReason: `Phân bổ từ Excel ${batch.fileName}, dòng ${row.row}`,
            },
          });
        consumed.add(match.exact!.id);
        await tx.auditLog.create({
          data: {
            ...actorStamp(actor),
            action: "EXCEL_ALLOCATION_APPLIED",
            entityId: match.exact!.id,
            details: {
              beforeFundId: match.exact!.fundId,
              beforeAssignment: match.exact!.assignment,
              ...updatedStamp(actor),
              fundId: f.id,
              importId: batch.id,
              row: row.row,
            },
          },
        });
        matched++;
      } else if (entryStatus === "REVIEW") review++;
      else added++;
      await tx.bankTransaction.create({
        data: {
          ...createdStamp(actor), ...updatedStamp(actor),
          accountId,
          sourceId,
          origin: "EXCEL",
          entryStatus,
          importId: batch.id,
          mergedIntoId: canMatch ? match.exact!.id : null,
          matchKey: ledgerMatchKey({
            direction: row.direction,
            amount,
            at,
            narrative: row.narrative,
          }),
          refId: row.refId,
          amount,
          direction: row.direction,
          narrative: row.narrative,
          displayName: row.displayName || "Người hùn phước",
          occurredAt: at,
          sourceHash: sourceId,
          source: row as unknown as Prisma.InputJsonValue,
          fundId: f.id,
          assignment: "MANUAL",
          matchReason: canMatch
            ? "Đã đối chiếu với giao dịch có sẵn"
            : entryStatus === "REVIEW"
              ? "Nghi trùng hoặc xung đột phân loại; chưa cộng vào tổng"
              : "Nhập từ Excel theo thiện pháp đã chọn",
        },
      });
    }
    const cursor = batch.cursor + rows.length;
    const updated = await tx.fundImport.update({
      where: { id: batch.id },
      data: {
        cursor,
        status: cursor >= batch.rowCount ? "COMPLETE" : "RUNNING",
        added: { increment: added },
        matched: { increment: matched },
        review: { increment: review },
      },
      select,
    });
    await tx.auditLog.create({
      data: {
        ...actorStamp(actor),
        action: "FUND_EXCEL_IMPORTED",
        entityId: f.id,
        details: {
          importId: batch.id,
          file: batch.fileName,
          sheet: batch.sheetName,
          fromRow: batch.cursor,
          toRow: cursor,
          added,
          matched,
          review,
        },
      },
    });
    return dto(updated);
  });
}
