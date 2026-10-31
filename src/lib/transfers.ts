import "server-only";
import { fundTotals, serializable } from "./ledger";
export async function transferFunds(input: { requestId: string; fromFundId: string; toFundId: string; amount: bigint; reason: string }, actor: string) {
  if (input.amount <= 0n || input.reason.trim().length < 5) throw new Error("Số tiền phải dương và cần lý do hợp lệ");
  return serializable(async tx => {
    const previous = await tx.transfer.findUnique({ where: { requestId: input.requestId } });
    if (previous) {
      if (previous.fromFundId !== input.fromFundId || previous.toFundId !== input.toFundId || previous.amount !== input.amount || previous.reason !== input.reason) throw new Error("Mã yêu cầu đã dùng cho nội dung khác. Tải lại trang trước khi tạo khoản mới.");
      return previous;
    }
    if (input.fromFundId === input.toFundId) throw new Error("Hai thiện pháp phải khác nhau");
    const totals = await fundTotals(tx);
    const from = totals.find(f => f.id === input.fromFundId), to = totals.find(f => f.id === input.toFundId);
    if (!from || !to || from.accountId !== to.accountId) throw new Error("Hai thiện pháp phải thuộc cùng tài khoản sao kê");
    if (!from.account.finalizedAt) throw new Error("Cần khóa sổ đầu kỳ trước khi điều chuyển");
    if (from.balance < input.amount) throw new Error("Số dư thiện pháp nguồn không đủ");
    const transfer = await tx.transfer.create({ data: { ...input, actor } });
    await tx.auditLog.create({ data: { actor, action: "TRANSFER_CREATED", entityId: transfer.id, details: { from: from.code, to: to.code, amount: input.amount.toString(), reason: input.reason } } });
    return transfer;
  });
}
export async function reverseFundTransfer(transferId: string, reason: string, actor: string) {
  if (reason.trim().length < 5) throw new Error("Cần ghi lý do đảo");
  return serializable(async tx => {
    const original = await tx.transfer.findUniqueOrThrow({ where: { id: transferId }, include: { reversal: true } });
    if (original.reversal || original.reversalOf) throw new Error("Điều chuyển đã được đảo hoặc là bút toán đảo");
    const totals = await fundTotals(tx), source = totals.find(f => f.id === original.toFundId)!;
    if (source.balance < original.amount) throw new Error("Thiện pháp nhận không còn đủ tiền để đảo toàn bộ khoản này");
    const reversal = await tx.transfer.create({ data: { requestId: crypto.randomUUID(), fromFundId: original.toFundId, toFundId: original.fromFundId, amount: original.amount, reason, actor, reversalOf: original.id } });
    await tx.auditLog.create({ data: { actor, action: "TRANSFER_REVERSED", entityId: reversal.id, details: { originalId: original.id, reason } } });
    return reversal;
  });
}
