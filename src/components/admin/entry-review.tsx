import { Modal } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { resolveDuplicate } from "@/app/admin/actions";
import { db } from "@/lib/db";
import {
  dateTime,
  vnd,
  localDate,
  startOfVietnamDay,
  fundUsesAccount,
} from "@/lib/domain";
import type { BankTransaction, Fund } from "@/generated/prisma/client";
export async function EntryReview({
  entry,
  funds,
}: {
  entry: BankTransaction;
  funds: Fund[];
}) {
  const start = startOfVietnamDay(localDate(entry.occurredAt));
  const candidates = await db.bankTransaction.findMany({
    where: {
      accountId: entry.accountId,
      entryStatus: "POSTED",
      direction: entry.direction,
      amount: entry.amount,
      occurredAt: { gte: start, lt: new Date(start.getTime() + 86400000) },
    },
    include: { fund: { select: { code: true } } },
    orderBy: { occurredAt: "desc" },
    take: 100,
  });
  return (
    <Modal
      wide
      title="Kiểm tra giao dịch nghi trùng"
      description="Khoản này chưa cộng vào tổng cho tới khi bạn xác nhận."
      trigger="Kiểm tra nghi trùng"
      triggerClassName="button subtle small"
    >
      <div className="modal-context">
        <strong>
          {vnd(entry.amount)} · {entry.direction === "CREDIT" ? "Thu" : "Chi"}
        </strong>
        <small>
          {dateTime(entry.occurredAt)} ·{" "}
          {entry.origin === "EXCEL" ? "Excel" : "Sao kê"}
        </small>
        <p>{entry.narrative}</p>
      </div>
      <ActionForm
        action={resolveDuplicate}
        label="Xác nhận kết quả kiểm tra"
        lockAfterSuccess
      >
        <input type="hidden" name="transactionId" value={entry.id} />
        <label>
          Kết quả
          <select name="decision" defaultValue="" required>
            <option value="" disabled>
              Chọn cách xử lý
            </option>
            <option value="MERGE">
              Đây là cùng một giao dịch — chỉ tính một lần
            </option>
            <option value="SEPARATE">
              Đây là giao dịch riêng — cộng vào tổng
            </option>
          </select>
        </label>
        <label>
          Giao dịch đối chiếu (khi chọn cùng một giao dịch)
          <select name="targetId" defaultValue="">
            <option value="">Chọn khoản đã có trong sổ</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {dateTime(c.occurredAt)} · {c.fund?.code ?? "Chưa gán"} ·{" "}
                {c.origin === "BANK" ? "Sao kê" : "Excel"} ·{" "}
                {c.narrative.slice(0, 100)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Thiện pháp ghi nhận
          <select name="fundId" defaultValue={entry.fundId ?? ""}>
            <option value="">Giữ thiện pháp hiện có / chưa phân loại</option>
            {funds
              .filter((f) => fundUsesAccount(f, entry.accountId))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.code} · {f.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Lý do kiểm tra
          <textarea
            name="reason"
            rows={3}
            required
            minLength={5}
            maxLength={1000}
          />
        </label>
        <div className="notice">
          Gộp chỉ được phép với khoản cùng tài khoản, số tiền và chiều thu/chi.
          Dữ liệu Excel và sao kê gốc đều được giữ để truy vết.
        </div>
      </ActionForm>
    </Modal>
  );
}
