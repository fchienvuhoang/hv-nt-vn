import { ActionForm } from "@/components/action-form";
import { saveFund } from "@/app/admin/actions";
import type { BankAccount, Fund } from "@/generated/prisma/client";
export function FundForm({
  accounts,
  fund,
}: {
  accounts: Pick<BankAccount, "id" | "number" | "label">[];
  fund?: Fund | null;
}) {
  return (
    <ActionForm
      key={fund?.id ?? "new"}
      action={saveFund}
      label={fund ? "Lưu cấu hình thiện pháp" : "Tạo thiện pháp"}
    >
      {fund && <input type="hidden" name="id" value={fund.id} />}
      <label>
        Tài khoản chính (cho số tổng hợp cũ)
        <select name="accountId" defaultValue={fund?.accountId} required>
          {accounts
            .filter((a) => !fund || a.id === fund.accountId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.number} · {a.label}
              </option>
            ))}
        </select>
      </label>
      <fieldset className="trial-accounts">
        <legend>Tài khoản nhận hùn phước</legend>
        {accounts.map((a) => (
          <label className="checkbox-label" key={a.id}>
            <input
              type="checkbox"
              name="accountIds"
              value={a.id}
              defaultChecked={
                !fund ||
                a.id === fund.accountId ||
                fund.accountIds.includes(a.id)
              }
            />
            {a.number} · {a.label}
          </label>
        ))}
      </fieldset>
      <div className="form-row">
        <label>
          Mã thiện pháp
          <input
            name="code"
            placeholder="TP112"
            defaultValue={fund?.code}
            pattern="[A-Za-z][A-Za-z0-9]{1,29}"
            required
            maxLength={30}
          />
        </label>
        <label>
          Trạng thái
          <select name="status" defaultValue={fund?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="PAUSED">Tạm dừng</option>
            <option value="COMPLETED">Hoàn thành</option>
          </select>
        </label>
      </div>
      <label>
        Tên thiện pháp
        <input
          name="name"
          placeholder="Tên đầy đủ của thiện pháp"
          defaultValue={fund?.name}
          minLength={3}
          maxLength={200}
          required
        />
      </label>
      <label>
        Từ khóa mở rộng
        <textarea
          name="keywords"
          rows={4}
          defaultValue={fund?.keywords.join("\n")}
          placeholder={"Mỗi dòng một từ khóa\nCHUA NGAI 10\nTT CHUA NGAI 10"}
        />
        <small>
          Mã chính được ưu tiên. Khớp nhiều thiện pháp sẽ chờ kiểm tra bằng tay.
        </small>
      </label>
      <label>
        Mô tả công khai
        <textarea
          name="description"
          rows={3}
          maxLength={3000}
          defaultValue={fund?.description}
        />
      </label>
      <div className="notice">
        Chỉ thiện pháp đang hoạt động nhận phân loại tự động. Thay đổi cấu hình
        không tự sửa giao dịch đã gán.
      </div>
    </ActionForm>
  );
}
