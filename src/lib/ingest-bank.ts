import {enqueuePush} from "./admin-push";
import {transactionPushKind} from "./push-policy";
import {allowedBankSyncTime} from "./sync-boundary";
import "server-only";
import { actorStamp, createdStamp, updatedStamp, type Actor } from "./actor";
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
  actor: Actor,
) {
  items=items.filter(i=>allowedBankSyncTime(i.transactionTime));
  if(!items.length)return {inserted:0,updated:0,knownCount:0,affectedFundIds:[] as string[]};
  const existing=await tx.bankTransaction.findMany({where:{accountId,sourceId:{in:items.map(i=>i.id)}},select:{id:true,sourceId:true,sourceHash:true,fundId:true}});
  const fingerprints=new Map(items.map(item=>[item.id,createHash("sha256").update(JSON.stringify(item)).digest("hex")]));
  const known = new Map(existing.map((row) => [row.sourceId, row]));
  if(items.every(item=>known.get(item.id)?.sourceHash===fingerprints.get(item.id)))return {inserted:0,updated:0,knownCount:existing.length,affectedFundIds:[] as string[]};
  const fresh = items.filter((item) => !known.has(item.id));
  const rules=fresh.length?await tx.fund.findMany():[];
  const affectedFundIds=new Set<string>();
  const dates = fresh.map((item) =>
    parseSourceTime(item.transactionTime).getTime(),
  );
  const excel = dates.length
    ? await tx.bankTransaction.findMany({
        where: {
          accountId,
          origin: "EXCEL",
          entryStatus: "POSTED",
          notes:{none:{kind:"SOURCE_DATE_MISSING"}},
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
    const hash = fingerprints.get(item.id)!;
    const old = known.get(item.id);
    if (old?.sourceHash === hash) continue;
    const at = parseSourceTime(item.transactionTime),
      amount = BigInt(item.transactionAmount),
      narrative = item.narrative ?? "";
    const values = {
      ...updatedStamp(actor),
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
      const allocated=await tx.fundAllocation.findMany({where:{transactionId:old.id}});
      if(allocated.length){
        if(item.type!=="CREDIT"||!old.fundId)throw new Error("Giao dịch đã tách phân bổ bị đổi chiều; cần đảo các điều chuyển trước khi đồng bộ lại.");
        const fixed=allocated.filter(a=>a.fundId!==old.fundId).reduce((n,a)=>n+a.amount,0n),remainder=amount-fixed;
        if(remainder<0n)throw new Error("Số tiền nguồn mới nhỏ hơn phần đã điều chuyển; cần đảo các điều chuyển của giao dịch trước khi đồng bộ lại.");
        if(remainder>0n)await tx.fundAllocation.upsert({where:{transactionId_fundId:{transactionId:old.id,fundId:old.fundId}},create:{transactionId:old.id,fundId:old.fundId,accountId,amount:remainder},update:{amount:remainder}});
        else await tx.fundAllocation.deleteMany({where:{transactionId:old.id,fundId:old.fundId}});
        for(const allocation of allocated)affectedFundIds.add(allocation.fundId);
      }
      await tx.bankTransaction.update({ where: { id: old.id }, data: values });
      await tx.auditLog.create({
        data: {
          ...actorStamp(actor),
          action: "SOURCE_UPDATED",
          entityId: old.id,
          details: {
            beforeHash: old.sourceHash,
            afterHash: hash,
            classificationPreserved: true,
          },
        },
      });
      if(old.fundId)affectedFundIds.add(old.fundId);
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
    if(fundId)affectedFundIds.add(fundId);
    additions.push({
      ...createdStamp(actor),
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
          ? `${automatic.reason.startsWith("Sai tài khoản nhận:") ? automatic.reason+" " : ""}Có giao dịch Excel cùng ngày, số tiền và chiều thu chi; cần kiểm tra trước khi cộng tổng`
          : automatic.reason,
    });
    if (match.exact) {
      links.push({ excelId: match.exact.id, bankId: id });
      match.exact.entryStatus = "MERGED";
    }
  }
  if (additions.length)
    await tx.bankTransaction.createMany({ data: additions });
  await enqueuePush(tx, additions.flatMap(row=>{const kind=transactionPushKind(row);return kind?[{key:`transaction:${row.id}:${kind}`,kind,transactionId:row.id}]:[]}));
  for (const link of links) {
    await tx.transactionNote.updateMany({where:{transactionId:link.excelId},data:{transactionId:link.bankId}});
    await tx.fundAllocation.updateMany({where:{transactionId:link.excelId},data:{transactionId:link.bankId}});
    await tx.transferItem.updateMany({where:{transactionId:link.excelId},data:{transactionId:link.bankId}});
    await tx.bankTransaction.update({
      where: { id: link.excelId },
      data: {
        ...updatedStamp(actor),
        entryStatus: "MERGED",
        mergedIntoId: link.bankId,
        matchReason: "Đã đối chiếu với sao kê; chỉ tính giao dịch ngân hàng",
      },
    });
    await tx.bankTransaction.updateMany({
      where: { mergedIntoId: link.excelId },
      data: { mergedIntoId: link.bankId, ...updatedStamp(actor) },
    });
    await tx.auditLog.create({
      data: {
        ...actorStamp(actor),
        action: "EXCEL_BANK_MATCHED",
        entityId: link.bankId,
        details: link,
      },
    });
  }
  return { inserted: additions.length, updated: changed,knownCount:existing.length,affectedFundIds:[...affectedFundIds] };
}
