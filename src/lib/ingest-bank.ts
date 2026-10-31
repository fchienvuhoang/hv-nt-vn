import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { LedgerClient } from "./ledger";
import type { SourceItem } from "./source";
import {
  classify,
  localDate,
  parseSourceTime,
  startOfVietnamDay,
} from "./domain";
import { chooseEntryMatch, ledgerMatchKey } from "./entry-matching";
export async function ingestBankPage(
  tx: LedgerClient,
  accountId: string,
  items: SourceItem[],
  actor: string,
) {
  const [rules, existing] = await Promise.all([
    tx.fund.findMany({
      where: { OR: [{ accountId }, { accountIds: { has: accountId } }] },
    }),
    tx.bankTransaction.findMany({
      where: { accountId, sourceId: { in: items.map((i) => i.id) } },
    }),
  ]);
  const known = new Map(existing.map((row) => [row.sourceId, row]));
  const fresh = items.filter((item) => !known.has(item.id));
  const dates = fresh.map((item) =>
    parseSourceTime(item.transactionTime).getTime(),
  );
  const excel = dates.length
    ? await tx.bankTransaction.findMany({
        where: {
          accountId,
          origin: "EXCEL",
          entryStatus: "POSTED",
          occurredAt: {
            gte: startOfVietnamDay(localDate(new Date(Math.min(...dates)))),
            lt: new Date(
              startOfVietnamDay(
                localDate(new Date(Math.max(...dates))),
              ).getTime() + 86400000,
            ),
          },
        },
      })
    : [];
  const additions: Prisma.BankTransactionCreateManyInput[] = [];
  const links: { excelId: string; bankId: string }[] = [];
  let changed = 0;
  for (const item of items) {
    const hash = createHash("sha256")
      .update(JSON.stringify(item))
      .digest("hex");
    const old = known.get(item.id);
    if (old?.sourceHash === hash) continue;
    const at = parseSourceTime(item.transactionTime),
      amount = BigInt(item.transactionAmount),
      narrative = item.narrative ?? "";
    const values = {
      refId: item.refId ?? "",
      amount,
      direction: item.type,
      narrative,
      displayName: item.displayName ?? "Người ủng hộ ẩn danh",
      hiddenNarrative: item.hiddenNarrative ?? false,
      hiddenNote: item.hiddenNote ?? false,
      occurredAt: at,
      sourceHash: hash,
      source: item as Prisma.InputJsonValue,
      matchKey: ledgerMatchKey({ direction: item.type, amount, at, narrative }),
    };
    if (old) {
      await tx.bankTransaction.update({ where: { id: old.id }, data: values });
      await tx.auditLog.create({
        data: {
          actor,
          action: "SOURCE_UPDATED",
          entityId: old.id,
          details: {
            beforeHash: old.sourceHash,
            afterHash: hash,
            classificationPreserved: true,
          },
        },
      });
      changed++;
      continue;
    }
    const match = chooseEntryMatch(
      { direction: item.type, amount, at, narrative, refId: values.refId },
      excel,
    );
    const automatic = classify(narrative, accountId, rules),
      id = randomUUID();
    const entryStatus = match.exact
      ? "POSTED"
      : match.suspected.length
        ? "REVIEW"
        : "POSTED";
    const fundId = match.exact?.fundId ?? automatic.fundId;
    additions.push({
      ...values,
      id,
      sourceId: item.id,
      accountId,
      origin: "BANK",
      entryStatus,
      fundId,
      assignment: match.exact ? "MANUAL" : fundId ? "AUTO" : "UNASSIGNED",
      matchReason: match.exact
        ? "Đối chiếu Excel: giữ thiện pháp đã nhập"
        : entryStatus === "REVIEW"
          ? "Có giao dịch Excel cùng ngày, số tiền và chiều thu chi; cần kiểm tra trước khi cộng tổng"
          : automatic.reason,
    });
    if (match.exact) {
      links.push({ excelId: match.exact.id, bankId: id });
      match.exact.entryStatus = "MERGED";
    }
  }
  if (additions.length)
    await tx.bankTransaction.createMany({ data: additions });
  for (const link of links) {
    await tx.bankTransaction.update({
      where: { id: link.excelId },
      data: {
        entryStatus: "MERGED",
        mergedIntoId: link.bankId,
        matchReason: "Đã đối chiếu với sao kê; chỉ tính giao dịch ngân hàng",
      },
    });
    await tx.bankTransaction.updateMany({
      where: { mergedIntoId: link.excelId },
      data: { mergedIntoId: link.bankId },
    });
    await tx.auditLog.create({
      data: {
        actor,
        action: "EXCEL_BANK_MATCHED",
        entityId: link.bankId,
        details: link,
      },
    });
  }
  return { inserted: additions.length, updated: changed };
}
