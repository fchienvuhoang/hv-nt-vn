"use client";
import { FUND_GOAL_TYPES, calculateLengthGoal, readLengthGoal, formatMeasure } from "@/lib/fund-goal";
import {keywordKey} from "@/lib/fund-keywords";
import { accountLabel } from "@/lib/account-label";
import { MoneyInput } from "@/components/money-input";
import { LoadingSpinner } from "@/components/loading-indicator";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { ActionState } from "@/app/admin/actions";
import { useToast } from "@/components/toasts";
import { useCloseModal } from "@/components/modal";
import { saveFund } from "@/lib/admin-api";
import { dateTime, fundUsesAccount, vnd, normalize } from "@/lib/domain";
import type { BankAccount, Fund } from "@/generated/prisma/client";
export function FundForm({
  accounts,
  fund,
}: {
  accounts: Pick<BankAccount, "id" | "number" | "label">[];
  fund?: Fund | null;
}) {
  const closeModal = useCloseModal();
  const toast = useToast();
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(async (previous, form) => {
    const result = await saveFund(previous, form);
    if (result.success && !result.error && !result.fieldErrors) closeModal?.();
    if (result.success) toast(result.success);
    else if (result.error) toast(result.error, "error");
    return result;
  }, {});
  const locked = pending || !!state.success;
  const formRef = useRef<HTMLFormElement>(null);
  const prefix = useId();
  const lengthGoal = readLengthGoal(fund?.goalType, fund?.goalConfig);
  const [values, setValues] = useState({
    code: fund?.code ?? "", name: fund?.name ?? "", status: fund?.status ?? "ACTIVE",
    transferKeyword:fund?.transferKeyword??"",
    keywords: fund?.keywords.join("\n") ?? "", description: fund?.description ?? "",
    goalAmount: fund?.goalAmount?.toString() ?? "",
    goalType: fund?.goalType ?? "MONEY",
    goalUnitPrice: lengthGoal?.unitPrice ?? "",
    goalWidth: lengthGoal?.width ?? "",
    goalQuantity: lengthGoal?.quantity ?? "",
    adminNote: fund?.adminNote ?? "",
    recognitionEnabled:fund?.recognitionEnabled?"1":"0",
    recognitionTitle:fund?.recognitionTitle??"Cổ phần",
    recognitionAmount:fund?.recognitionAmount?.toString()??"",
  });
  const transferChoices=[...new Map(values.keywords.split(/[\r\n;,]/).map(normalize).filter(value=>value&&keywordKey(value)!==keywordKey(values.code)).map(value=>[keywordKey(value),value])).values()];
  const selectedTransferKeyword=transferChoices.find(value=>keywordKey(value)===keywordKey(values.transferKeyword))??"";
  let lengthPreview: ReturnType<typeof calculateLengthGoal> | null = null;
  if (values.goalType === "LENGTH") {
    try { lengthPreview = calculateLengthGoal(values.goalUnitPrice, values.goalWidth, values.goalQuantity); } catch { /* Preview appears only when all inputs are valid. */ }
  }
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
        <div>{accounts.filter(a=>!fund||fundUsesAccount(fund,a.id)).map((a) => <strong key={a.id}>{accountLabel(a.number)} · {a.label}</strong>)}</div>
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
      <div className="fund-goal-editor">
        <label>Loại mục tiêu thành tựu
          <select name="goalType" aria-label="Loại mục tiêu thành tựu" value={values.goalType} onChange={event=>change("goalType",event.target.value)} {...errorProps("goalType")}>
            {FUND_GOAL_TYPES.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          {errorMessage("goalType")}
        </label>
        {values.goalType==="MONEY" ? <label>
          Mục tiêu thành tựu (₫)
          <MoneyInput name="goalAmount" placeholder="Ví dụ: 100.000.000" value={values.goalAmount} onValueChange={value=>change("goalAmount",value)} {...errorProps("goalAmount")} />
          {errorMessage("goalAmount")}
          <small>{/^\d{1,15}$/.test(values.goalAmount) ? vnd(values.goalAmount) : "Để trống nếu chưa có mục tiêu. Tự phân cách hàng nghìn khi nhập hoặc dán số tiền."}</small>
        </label> : <>
          <label>Bề rộng mô tả (m)<input name="goalWidth" type="text" inputMode="decimal" maxLength={14} value={values.goalWidth} onChange={event=>change("goalWidth",event.target.value)} placeholder="Ví dụ: 3" required {...errorProps("goalWidth")}/>{errorMessage("goalWidth")}</label>
          <div className="form-row">
            <label>Đơn giá mỗi mét dài (₫)<MoneyInput name="goalUnitPrice" value={values.goalUnitPrice} onValueChange={value=>change("goalUnitPrice",value)} placeholder="Ví dụ: 430.000" required {...errorProps("goalUnitPrice")}/>{errorMessage("goalUnitPrice")}</label>
            <label>Chiều dài mục tiêu (m)<input name="goalQuantity" type="text" inputMode="decimal" maxLength={14} value={values.goalQuantity} onChange={event=>change("goalQuantity",event.target.value)} placeholder="Ví dụ: 350 hoặc 12,5" required {...errorProps("goalQuantity")}/>{errorMessage("goalQuantity")}</label>
          </div>
          <div className="fund-goal-preview" role="status">{lengthPreview ? <><strong>Tổng mục tiêu: {vnd(lengthPreview.goalAmount)}</strong><span>{formatMeasure(lengthPreview.goalConfig.quantity)} mét dài × {vnd(lengthPreview.goalConfig.unitPrice)}/mét dài · Rộng {formatMeasure(lengthPreview.goalConfig.width)}m (mô tả)</span></> : <span>Nhập bề rộng, đơn giá và chiều dài để tính tổng mục tiêu.</span>}</div>
          <small>Số mét hỗ trợ tối đa 4 chữ số thập phân. Tổng tiền = chiều dài × đơn giá/mét dài, làm tròn lên đến 1 đồng nếu cần. Bề rộng chỉ để mô tả, không nhân vào tiền. Tiến độ mét dài quy đổi từ tiền hùn phước.</small>
        </>}
      </div>
      <label>Danh sách ghi phương danh
        <select name="recognitionEnabled" value={values.recognitionEnabled} onChange={event=>change("recognitionEnabled",event.target.value)}>
          <option value="0">Tắt</option><option value="1">Bật trang công khai theo cổ phần</option>
        </select>
      </label>
      <div className="form-row">
        <label>Tên cổ phần<input name="recognitionTitle" maxLength={100} value={values.recognitionTitle} required={values.recognitionEnabled==="1"} onChange={event=>change("recognitionTitle",event.target.value)}/>{errorMessage("recognitionTitle")}</label>
        <label>Giá trị một cổ phần (₫)<MoneyInput name="recognitionAmount" value={values.recognitionAmount} onValueChange={value=>change("recognitionAmount",value)} {...errorProps("recognitionAmount")}/>{errorMessage("recognitionAmount")}</label>
      </div>
      <small>Xét từng khoản hùn phước gốc từ mức này trở lên, không cộng dồn. Không thay đổi tổng thu, chi hay số dư. Tên ghi phương danh có thể bổ sung riêng.</small>
      <label>
        Ghi chú nội bộ
        <textarea name="adminNote" rows={3} maxLength={3000} placeholder="Ghi chú theo dõi thiện pháp…" value={values.adminNote} onChange={event=>change("adminNote",event.target.value)} {...errorProps("adminNote")} />
        {errorMessage("adminNote")}
        <small>Hiển thị dưới số tiền Hùn phước trong danh sách quản trị.</small>
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
        Từ khóa hiển thị khi chuyển khoản
        <select name="transferKeyword" value={selectedTransferKeyword} onChange={event=>change("transferKeyword",event.target.value)} {...errorProps("transferKeyword")}>
          <option value="">Dùng mã chính ({values.code||"mã thiện pháp"})</option>
          {transferChoices.map(value=><option key={value} value={value}>{value}</option>)}
        </select>
        {errorMessage("transferKeyword")}
        <small>Mẫu công khai: {selectedTransferKeyword||values.code||"MÃ"} TÊN SĐT. Chỉ đổi nội dung hướng dẫn, mã và link thiện pháp giữ nguyên. Nếu xóa từ khóa đã chọn, mẫu trở về mã chính.</small>
      </label>
      <input type="hidden" name="description" value={values.description} />
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
