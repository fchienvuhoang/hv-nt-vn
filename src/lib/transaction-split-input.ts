import { z } from "zod";
const id = z.string().min(1).max(100);
export const transactionSplitSchema = z.object({
  requestId: z.string().uuid(),
  transactionId: id,
  updatedAt: z.string().datetime(),
  reason: z.string().trim().min(5, "Lý do cần ít nhất 5 ký tự").max(1000),
  shares: z.array(z.object({ fundId: id, amount: z.string().regex(/^[1-9]\d{0,14}$/, "Mỗi phần phải là số tiền VND nguyên lớn hơn 0") })).min(2, "Chọn ít nhất hai thiện pháp").max(30, "Tối đa 30 thiện pháp mỗi giao dịch"),
}).superRefine((value, ctx) => {
  if (new Set(value.shares.map(s => s.fundId)).size !== value.shares.length)
    ctx.addIssue({ code: "custom", path: ["shares"], message: "Mỗi thiện pháp chỉ được chọn một lần" });
});
export type TransactionSplitInput = z.input<typeof transactionSplitSchema>;
export function validateSplitTotal(shares: { amount: string }[], amount: bigint) {
  if (shares.reduce((sum, share) => sum + BigInt(share.amount), 0n) !== amount)
    throw new Error("Tổng các phần phải bằng đúng số tiền gốc. Hãy phân bổ cả phần còn lại trước khi lưu.");
}
/** Original receipt shares remain stable when a later internal transfer moves current balances. */
export function originalFundShare(row: { amount: bigint; originalAllocations?: unknown }, fundId: string) {
  if (!Array.isArray(row.originalAllocations)) return row.amount;
  const share = row.originalAllocations.find(s => s && s.fundId === fundId);
  return share ? BigInt(share.amount) : 0n;
}
