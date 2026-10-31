import { randomUUID } from "node:crypto";
import { ActionForm } from "@/components/action-form";
import { createTransfer } from "@/app/admin/actions";
import { vnd } from "@/lib/domain";
import type { fundTotals } from "@/lib/ledger";
export function TransferForm({
  funds,
}: {
  funds: Awaited<ReturnType<typeof fundTotals>>;
}) {
  const eligible = funds.filter((f) => f.account.finalizedAt);
  return (
    <ActionForm
      action={createTransfer}
      lockAfterSuccess
      label="Ghi nhận điều chuyển"
      confirm="Xác nhận điều chuyển số tiền giữa hai thiện pháp?"
    >
      <input type="hidden" name="requestId" value={randomUUID()} />
      <label>
        Từ thiện pháp
        <select name="fromFundId" required defaultValue="">
          <option value="" disabled>
            Chọn nguồn tiền
          </option>
          {eligible.map((f) => (
            <option key={f.id} value={f.id}>
              {f.account.number} · {f.code} · Còn {vnd(f.balance)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Đến thiện pháp
        <select name="toFundId" required defaultValue="">
          <option value="" disabled>
            Chọn nơi nhận
          </option>
          {eligible.map((f) => (
            <option key={f.id} value={f.id}>
              {f.account.number} · {f.code} · {f.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Số tiền (VND)
        <input
          name="amount"
          inputMode="numeric"
          pattern="[0-9]{1,15}"
          placeholder="2000000"
          required
        />
      </label>
      <label>
        Lý do điều chuyển
        <textarea
          name="reason"
          rows={3}
          required
          minLength={5}
          maxLength={1000}
        />
      </label>
      <div className="notice">
        Chỉ điều chuyển trong cùng tài khoản sao kê và khi đủ số dư. Đây là phân
        bổ nội bộ, không thực hiện chuyển khoản ngân hàng.
      </div>
    </ActionForm>
  );
}
