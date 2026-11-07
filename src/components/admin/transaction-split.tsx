"use client";
import { useRef, useState } from "react";
import { Modal, useCloseModal } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { splitBankTransaction } from "@/lib/admin-api";
import { fundUsesAccount, vnd } from "@/lib/domain";
import { fundOptionLabel } from "@/lib/account-label";
import { fundAssignmentWarning } from "@/lib/fund-assignment-warning";
import { useToast } from "@/components/toasts";
import type { AdminTransactions } from "@/lib/admin-read-model";
import styles from "./transaction-split.module.css";
type Props = { row: AdminTransactions["rows"][number]; funds: AdminTransactions["funds"]; accounts: { id: string; number: string }[] };
export function TransactionSplit({ row, funds, accounts }: Props) {
  return <Modal wide title="Chia giao dịch cho nhiều thiện pháp" trigger={row.originalAllocations ? "Sửa chia thiện pháp" : "Chia nhiều thiện pháp"} triggerClassName="button subtle small" description="Giữ nguyên giao dịch ngân hàng; mỗi thiện pháp chỉ ghi nhận phần được chia.">
    <SplitForm key={`${row.id}:${row.updatedAt.toISOString()}`} row={row} funds={funds} accounts={accounts}/>
  </Modal>;
}
function SplitForm({ row, funds, accounts }: Props) {
  const eligible = funds.filter(f => fundUsesAccount(f, row.accountId));
  const [shares, setShares] = useState(() => row.allocations.length ? row.allocations.map(a => ({ fundId: a.fundId, amount: a.amount.toString() })) : [{ fundId: row.fund?.id ?? "", amount: row.originalAmount.toString() }, { fundId: "", amount: "" }]);
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const operation = useRef<{ signature: string; id: string } | null>(null), close = useCloseModal(), toast = useToast();
  const total = shares.reduce((sum, s) => sum + BigInt(s.amount || "0"), 0n), remaining = row.originalAmount - total;
  const valid = shares.length >= 2 && shares.every(s => s.fundId && BigInt(s.amount || "0") > 0n) && new Set(shares.map(s => s.fundId)).size === shares.length && remaining === 0n && reason.trim().length >= 5;
  function change(index: number, patch: Partial<typeof shares[number]>) { setShares(items => items.map((s, i) => i === index ? { ...s, ...patch } : s)); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy || !valid) return;
    const payload = { transactionId: row.id, updatedAt: row.updatedAt.toISOString(), shares, reason: reason.trim() }, signature = JSON.stringify(payload);
    if (operation.current?.signature !== signature) operation.current = { signature, id: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const result = await splitBankTransaction({ ...payload, requestId: operation.current.id });
      if (result.error) throw new Error(result.error);
      toast(result.success ?? "Đã chia giao dịch"); close?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể chia giao dịch"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className={styles.form}>
    <div className="modal-context"><strong>{row.direction === "CREDIT" ? "Khoản thu" : "Khoản chi"} gốc: {vnd(row.originalAmount)}</strong><p>{row.narrative || "Không có nội dung"}</p></div>
    <fieldset disabled={busy} className={styles.fields}><legend>Phân bổ cho từng thiện pháp</legend>
      {shares.map((share, index) => <div key={index} className={styles.share}>
        <label>Thiện pháp {index + 1}<select aria-label={`Thiện pháp ${index + 1}`} value={share.fundId} onChange={e => change(index, { fundId: e.target.value })} required>
          <option value="">Chọn thiện pháp</option>{eligible.map(f => <option key={f.id} value={f.id} disabled={shares.some((s, i) => i !== index && s.fundId === f.id)}>{fundOptionLabel(f, accounts)}</option>)}
        </select></label>
        <label>Số tiền (VND)<MoneyInput value={share.amount} onValueChange={amount => change(index, { amount })} required /></label>
        <button type="button" className="button subtle small" aria-label={`Bỏ phần ${index + 1}`} disabled={shares.length <= 2} onClick={() => setShares(items => items.filter((_, i) => i !== index))}>Bỏ</button>
        {fundAssignmentWarning(eligible.find(f => f.id === share.fundId)) && <small className={styles.warning}>{fundAssignmentWarning(eligible.find(f => f.id === share.fundId))}</small>}
      </div>)}
      <button type="button" className="button subtle" disabled={shares.length >= 30 || shares.length >= eligible.length} onClick={() => setShares(items => [...items, { fundId: "", amount: remaining > 0n ? remaining.toString() : "" }])}>+ Thêm thiện pháp</button>
      <div className={styles.totals} role="status"><span>Đã phân bổ: <b>{vnd(total)}</b></span><strong className={remaining === 0n ? "positive" : "negative"}>{remaining < 0n ? `Vượt ${vnd(-remaining)}` : `Còn lại ${vnd(remaining)}`}</strong></div>
      <label>Lý do chia giao dịch<textarea value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={1000} required rows={2} /></label>
    </fieldset>
    {error && <div role="alert" className="notice danger">{error}</div>}
    <button className="button primary" type="submit" disabled={busy || !valid}>{busy ? "Đang lưu…" : "Lưu phân bổ"}</button>
  </form>;
}
