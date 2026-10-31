"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { createTransfer } from "@/app/admin/actions";
import { fundUsesAccount, vnd } from "@/lib/domain";
export function TransferFormFields({
  requestId,
  accounts,
  funds,
}: {
  requestId: string;
  accounts: { id: string; number: string; label: string }[];
  funds: {
    id: string;
    code: string;
    name: string;
    accountId: string;
    accountIds: string[];
    byAccount: { accountId: string; balance: string }[];
  }[];
}) {
  const [accountId, setAccount] = useState(accounts[0]?.id ?? "");
  const eligible = funds.filter((f) => fundUsesAccount(f, accountId));
  return (
    <ActionForm
      action={createTransfer}
      label="Ghi nhận điều chuyển"
      lockAfterSuccess
      confirm="Xác nhận điều chuyển số tiền giữa hai thiện pháp trong cùng tài khoản?"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <label>
        Tài khoản thực hiện
        <select
          name="accountId"
          value={accountId}
          onChange={(e) => setAccount(e.target.value)}
          required
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.number} · {a.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Từ thiện pháp
        <select
          key={`from-${accountId}`}
          name="fromFundId"
          required
          defaultValue=""
        >
          <option value="" disabled>
            Chọn nguồn tiền
          </option>
          {eligible.map((f) => (
            <option key={f.id} value={f.id}>
              {f.code} · Còn{" "}
              {vnd(
                f.byAccount.find((a) => a.accountId === accountId)?.balance ??
                  "0",
              )}
            </option>
          ))}
        </select>
      </label>
      <label>
        Đến thiện pháp
        <select
          key={`to-${accountId}`}
          name="toFundId"
          required
          defaultValue=""
        >
          <option value="" disabled>
            Chọn nơi nhận
          </option>
          {eligible.map((f) => (
            <option key={f.id} value={f.id}>
              {f.code} · {f.name}
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
        Chỉ điều chuyển phần tiền trong tài khoản đã chọn. Không dùng số dư của
        tài khoản khác và không tạo giao dịch chuyển khoản ngân hàng.
      </div>
    </ActionForm>
  );
}
