"use client";
import { LoadingSpinner } from "@/components/loading-indicator";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { ActionState } from "@/app/admin/actions";
import { useActionToast } from "@/components/toasts";
import { useCloseModal } from "@/components/modal";
import { saveFund } from "@/lib/admin-api";
import { dateTime, fundUsesAccount } from "@/lib/domain";
import type { BankAccount, Fund } from "@/generated/prisma/client";
export function FundForm({
  accounts,
  fund,
}: {
  accounts: Pick<BankAccount, "id" | "number" | "label">[];
  fund?: Fund | null;
}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(saveFund, {});
  const locked = pending || !!state.success;
  const closeModal = useCloseModal();
  useActionToast(state, closeModal);
  const formRef = useRef<HTMLFormElement>(null);
  const prefix = useId();
  const [values, setValues] = useState({
    code: fund?.code ?? "", name: fund?.name ?? "", status: fund?.status ?? "ACTIVE",
    keywords: fund?.keywords.join("\n") ?? "", description: fund?.description ?? "",
    sourceUrl: fund?.sourceUrl ?? "",
  });
  const [edited, setEdited] = useState<Record<string, boolean>>({});
  function change(field: keyof typeof values, value: string) {
    setValues(previous => ({ ...previous, [field]: value }));
    setEdited(previous => ({ ...previous, [field]: true }));
  }
  function fieldErrors(field: keyof typeof values) {
    return edited[field] ? [] : (state.fieldErrors?.[field] ?? []);
  }
  function errorProps(field: keyof typeof values) {
    return { "aria-invalid": fieldErrors(field).length > 0, "aria-describedby": fieldErrors(field).length ? `${prefix}-${field}-error` : undefined };
  }
  function errorMessage(field: keyof typeof values) {
    const errors = fieldErrors(field);
    return errors.length ? <span id={`${prefix}-${field}-error`} className="field-error" role="alert">{errors.join("\n")}</span> : null;
  }
  useEffect(() => {
    if (state.fieldErrors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  return (
    <form ref={formRef} action={dispatch} className="action-form fund-form" aria-busy={pending} onReset={event => event.preventDefault()} onSubmit={() => setEdited({})}>
      <fieldset className="action-fields" disabled={locked}>
      {fund && <input type="hidden" name="id" value={fund.id} />}
      <div className="fund-accounts-readonly" role="group" aria-label="Tài khoản thu chi được phép">
        <span>Tài khoản thu / chi</span>
        <div>{accounts.filter(a=>!fund||fundUsesAccount(fund,a.id)).map((a) => <strong key={a.id}>{a.number} · {a.label}</strong>)}</div>
        <small>Chỉ ghi nhận thu và chi từ các tài khoản hiển thị ở trên. Tài khoản thực tế của giao dịch không thay đổi khi gán thiện pháp.</small>
      </div>
      <div className="form-row">
        <label>
          Mã thiện pháp
          <input
            name="code"
            placeholder="TP112"
            value={values.code}
            onChange={event => change("code", event.target.value)}
            {...errorProps("code")}
            pattern="[A-Za-z][A-Za-z0-9]{1,29}"
            required
            maxLength={30}
          />
          {errorMessage("code")}
        </label>
        <label>
          Trạng thái
          <select name="status" value={values.status} onChange={event => change("status", event.target.value)} {...errorProps("status")}>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="PAUSED">Tạm dừng</option>
            <option value="COMPLETED">Hoàn thành</option>
          </select>
          {errorMessage("status")}
        </label>
      </div>
      <label>
        Tên thiện pháp
        <input
          name="name"
          placeholder="Tên đầy đủ của thiện pháp"
          value={values.name}
          onChange={event => change("name", event.target.value)}
          {...errorProps("name")}
          minLength={3}
          maxLength={200}
          required
        />
        {errorMessage("name")}
      </label>
      <label>
        Từ khóa mở rộng
        <textarea
          name="keywords"
          rows={4}
          value={values.keywords}
          onChange={event => change("keywords", event.target.value)}
          {...errorProps("keywords")}
          placeholder={"Mỗi dòng một từ khóa\nCHUA NGAI 10\nTT CHUA NGAI 10"}
        />
        {errorMessage("keywords")}
        <small>
          Không được trùng mã hoặc từ khóa của thiện pháp khác, kể cả đã hoàn thành hoặc tạm dừng. Không phân biệt hoa/thường, dấu tiếng Việt và khoảng trắng.
        </small>
      </label>
      <label>
        Mô tả công khai
        <textarea
          name="description"
          rows={3}
          maxLength={3000}
          value={values.description}
          onChange={event => change("description", event.target.value)}
          {...errorProps("description")}
        />
        {errorMessage("description")}
      </label>
      <label>
        Link Excel nguồn
        <input name="sourceUrl" type="url" maxLength={2000} placeholder="https://docs.google.com/spreadsheets/d/…" value={values.sourceUrl} onChange={event => change("sourceUrl", event.target.value)} {...errorProps("sourceUrl")} />
        {errorMessage("sourceUrl")}
        <small>Link sổ Excel/Google Sheets cũ để quản trị viên mở lại đối chiếu.</small>
        {fund?.sourceUrl && <a href={fund.sourceUrl} target="_blank" rel="noopener noreferrer">Mở Excel nguồn ↗</a>}
      </label>
      <div className="notice">
        Chỉ thiện pháp đang hoạt động nhận phân loại tự động. Thay đổi cấu hình
        không tự sửa giao dịch đã gán.
      </div>
      {fund && <div className="fund-authorship"><span title={`ID người tạo: ${fund.createdById ?? "Chưa có thông tin"}`}>Tạo: <strong>{fund.createdByName || "Chưa có thông tin người tạo"}</strong> · {dateTime(fund.createdAt)}</span><span title={`ID người cập nhật: ${fund.updatedById ?? "Chưa có thông tin"}`}>Cập nhật: <strong>{fund.updatedByName || "Chưa có thông tin người sửa"}</strong> · {dateTime(fund.updatedAt)}</span></div>}
      </fieldset>
      <button className="button primary" type="submit" disabled={locked}>{pending ? <><LoadingSpinner size={20}/>Đang lưu…</> : fund ? "Lưu cấu hình thiện pháp" : "Tạo thiện pháp"}</button>
    </form>
  );
}
