import "server-only";
import { createHash } from "node:crypto";
import { serializable } from "./ledger";
import { actorStamp, updatedStamp, type Actor } from "./actor";
import { fundUsesAccount, vnd } from "./domain";
import { transactionSplitSchema, validateSplitTotal, type TransactionSplitInput } from "./transaction-split-input";

export async function splitTransaction(input: TransactionSplitInput, actor: Actor) {
  const values = transactionSplitSchema.parse(input);
  const fingerprint = createHash("sha256").update(JSON.stringify({ ...values, shares: [...values.shares].sort((a,b) => a.fundId.localeCompare(b.fundId)) })).digest("hex");
  return serializable(async tx => {
    const previous = await tx.auditLog.findFirst({ where: { action: "TRANSACTION_SPLIT", entityId: values.requestId } });
    if (previous) {
      if ((previous.details as { fingerprint?: string }).fingerprint !== fingerprint || previous.actor !== actorStamp(actor).actor)
        throw new Error("Mã yêu cầu đã được dùng cho thao tác khác");
      return { count: values.shares.length };
    }
    const row = await tx.bankTransaction.findUniqueOrThrow({ where: { id: values.transactionId }, include: { allocations: true, _count: { select: { allocationTransfers: true } } } });
    if (row.entryStatus !== "POSTED") throw new Error("Chỉ chia giao dịch đã ghi nhận; số dư chuyển sang và giao dịch nghi trùng cần xử lý riêng.");
    if (row.updatedAt.toISOString() !== values.updatedAt) throw new Error("Giao dịch vừa thay đổi. Hãy đóng hộp thoại, tải lại dữ liệu và chia lại.");
    if (row._count.allocationTransfers) throw new Error("Giao dịch đã tham gia điều chuyển nội bộ; không thể thay đổi phân bổ gốc. Hãy dùng chức năng điều chuyển cho các phần hiện có.");
    validateSplitTotal(values.shares, row.amount);
    const funds = await tx.fund.findMany({ where: { id: { in: values.shares.map(s => s.fundId) } } });
    if (funds.length !== values.shares.length || funds.some(f => !fundUsesAccount(f, row.accountId)))
      throw new Error("Các thiện pháp nhận phải tồn tại và hỗ trợ tài khoản của giao dịch.");
    await tx.fundAllocation.deleteMany({ where: { transactionId: row.id } });
    await tx.fundAllocation.createMany({ data: values.shares.map(s => ({ transactionId: row.id, accountId: row.accountId, fundId: s.fundId, amount: BigInt(s.amount) })) });
    await tx.bankTransaction.update({ where: { id: row.id }, data: { fundId: values.shares[0].fundId, originalAllocations: values.shares, assignment: "MANUAL", matchReason: values.reason, ...updatedStamp(actor) } });
    const text = `Phân bổ giao dịch gốc ${vnd(row.amount)} cho ${values.shares.map(s => `${funds.find(f => f.id === s.fundId)!.code}: ${vnd(s.amount)}`).join("; ")}. Lý do: ${values.reason}`;
    await tx.transactionNote.create({ data: { requestId: values.requestId, transactionId: row.id, kind: "DIRECT_SPLIT", text, ...actorStamp(actor) } });
    await tx.auditLog.create({ data: { ...actorStamp(actor), action: "TRANSACTION_SPLIT", entityId: values.requestId, details: { fingerprint, transactionId: row.id, reason: values.reason, before: row.allocations.length ? row.allocations.map(a => ({ fundId: a.fundId, amount: a.amount.toString() })) : [{ fundId: row.fundId, amount: row.amount.toString() }], shares: values.shares } } });
    return { count: values.shares.length };
  });
}
