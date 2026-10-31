import "server-only";
import { actorStamp, type Actor } from "./actor";
import { fundUsesAccount } from "./domain";
import { fundTotals, serializable } from "./ledger";
export async function transferFunds(
  input: {
    requestId: string;
    accountId?: string;
    fromFundId: string;
    toFundId: string;
    amount: bigint;
    reason: string;
  },
  actor: Actor,
) {
  if (input.amount <= 0n || input.reason.trim().length < 5)
    throw new Error("Số tiền phải dương và cần lý do hợp lệ");
  return serializable(async (tx) => {
    const previous = await tx.transfer.findUnique({
      where: { requestId: input.requestId },
    });
    if (previous) {
      if (
        (input.accountId && previous.accountId !== input.accountId) ||
        previous.fromFundId !== input.fromFundId ||
        previous.toFundId !== input.toFundId ||
        previous.amount !== input.amount ||
        previous.reason !== input.reason
      )
        throw new Error(
          "Mã yêu cầu đã dùng cho nội dung khác. Tải lại trang trước khi tạo khoản mới.",
        );
      return previous;
    }
    if (input.fromFundId === input.toFundId)
      throw new Error("Hai thiện pháp phải khác nhau");
    const totals = await fundTotals(tx);
    const from = totals.find((f) => f.id === input.fromFundId),
      to = totals.find((f) => f.id === input.toFundId);
    if (!from || !to) throw new Error("Không tìm thấy thiện pháp");
    const accountId = input.accountId ?? from.accountId;
    if (!fundUsesAccount(from, accountId) || !fundUsesAccount(to, accountId))
      throw new Error("Hai thiện pháp phải có cùng tài khoản sao kê đã chọn");
    if (
      (from.byAccount.find((a) => a.accountId === accountId)?.balance ?? 0n) <
      input.amount
    )
      throw new Error(
        "Số dư thiện pháp nguồn trong tài khoản đã chọn không đủ",
      );
    const transfer = await tx.transfer.create({
      data: { ...input, accountId, ...actorStamp(actor) },
    });
    await tx.auditLog.create({
      data: {
        ...actorStamp(actor),
        action: "TRANSFER_CREATED",
        entityId: transfer.id,
        details: {
          from: from.code,
          to: to.code,
          amount: input.amount.toString(),
          reason: input.reason,
        },
      },
    });
    return transfer;
  });
}
export async function reverseFundTransfer(
  transferId: string,
  reason: string,
  actor: Actor,
) {
  if (reason.trim().length < 5) throw new Error("Cần ghi lý do đảo");
  return serializable(async (tx) => {
    const original = await tx.transfer.findUniqueOrThrow({
      where: { id: transferId },
      include: { reversal: true },
    });
    if (original.reversal || original.reversalOf)
      throw new Error("Điều chuyển đã được đảo hoặc là bút toán đảo");
    const totals = await fundTotals(tx),
      source = totals.find((f) => f.id === original.toFundId)!;
    const accountId = original.accountId ?? source.accountId;
    if (
      (source.byAccount.find((a) => a.accountId === accountId)?.balance ?? 0n) <
      original.amount
    )
      throw new Error(
        "Thiện pháp nhận không còn đủ tiền để đảo toàn bộ khoản này",
      );
    const reversal = await tx.transfer.create({
      data: {
        requestId: crypto.randomUUID(),
        accountId,
        fromFundId: original.toFundId,
        toFundId: original.fromFundId,
        amount: original.amount,
        reason,
        ...actorStamp(actor),
        reversalOf: original.id,
      },
    });
    await tx.auditLog.create({
      data: {
        ...actorStamp(actor),
        action: "TRANSFER_REVERSED",
        entityId: reversal.id,
        details: { originalId: original.id, reason },
      },
    });
    return reversal;
  });
}
