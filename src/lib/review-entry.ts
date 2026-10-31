import "server-only";
import { actorStamp, updatedStamp, type Actor } from "./actor";
import { fundUsesAccount } from "./domain";
import { serializable } from "./ledger";
export async function reviewEntry(
  input: {
    id: string;
    decision: "SEPARATE" | "MERGE";
    targetId?: string;
    fundId?: string;
    reason: string;
  },
  actor: Actor,
) {
  if (input.reason.trim().length < 5)
    throw new Error("Cần ghi lý do ít nhất 5 ký tự");
  return serializable(async (tx) => {
    const entry = await tx.bankTransaction.findUniqueOrThrow({
      where: { id: input.id },
    });
    if (entry.entryStatus !== "REVIEW")
      throw new Error(
        "Giao dịch không còn chờ kiểm tra. Tải lại trang để xem trạng thái mới",
      );
    if(await tx.fundAllocation.count({where:{transactionId:{in:[entry.id,...(input.targetId?[input.targetId]:[])]}}}))throw new Error("Giao dịch đã tách phân bổ; hãy đảo các lượt điều chuyển trước khi đối chiếu/gộp giao dịch.");
    const fund = input.fundId
      ? await tx.fund.findUniqueOrThrow({ where: { id: input.fundId } })
      : null;
    if (fund && !fundUsesAccount(fund, entry.accountId))
      throw new Error("Thiện pháp phải cùng tài khoản");
    if (input.decision === "SEPARATE") {
      await tx.bankTransaction.update({
        where: { id: entry.id },
        data: {
          ...updatedStamp(actor),
          entryStatus: "POSTED",
          ...(fund ? { fundId: fund.id, assignment: "MANUAL" } : {}),
          matchReason: input.reason,
        },
      });
    } else {
      if (!input.targetId || input.targetId === entry.id)
        throw new Error("Chọn giao dịch đối chiếu");
      const target = await tx.bankTransaction.findUniqueOrThrow({
        where: { id: input.targetId },
      });
      if (
        target.entryStatus !== "POSTED" ||
        target.accountId !== entry.accountId ||
        target.amount !== entry.amount ||
        target.direction !== entry.direction
      )
        throw new Error(
          "Giao dịch đối chiếu phải đang được tính tổng, cùng tài khoản, số tiền và chiều thu chi",
        );
      const bankIsEntry = entry.origin === "BANK" && target.origin === "EXCEL";
      const survivor = bankIsEntry ? entry : target,
        loser = bankIsEntry ? target : entry;
      const fundId = fund?.id ?? target.fundId ?? entry.fundId;
      await tx.bankTransaction.update({
        where: { id: survivor.id },
        data: {
          ...updatedStamp(actor),
          entryStatus: "POSTED",
          fundId,
          assignment: fundId ? "MANUAL" : "UNASSIGNED",
          matchReason: input.reason,
        },
      });
      await tx.bankTransaction.update({
        where: { id: loser.id },
        data: {
          ...updatedStamp(actor),
          entryStatus: "MERGED",
          mergedIntoId: survivor.id,
          matchReason: input.reason,
        },
      });
      await tx.transactionNote.updateMany({where:{transactionId:loser.id},data:{transactionId:survivor.id}});
      await tx.transferItem.updateMany({where:{transactionId:loser.id},data:{transactionId:survivor.id}});
      await tx.bankTransaction.updateMany({
        where: { mergedIntoId: loser.id },
        data: { mergedIntoId: survivor.id, ...updatedStamp(actor) },
      });
    }
    await tx.auditLog.create({
      data: {
        ...actorStamp(actor),
        action: "DUPLICATE_REVIEWED",
        entityId: entry.id,
        details: {
          decision: input.decision,
          targetId: input.targetId ?? null,
          fundId: input.fundId ?? null,
          reason: input.reason,
        },
      },
    });
  });
}
