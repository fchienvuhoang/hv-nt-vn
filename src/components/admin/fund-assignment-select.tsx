"use client";
import { useState } from "react";
import { fundOptionLabel } from "@/lib/account-label";
import { fundAssignmentWarning } from "@/lib/fund-assignment-warning";
type Fund = { id: string; code: string; name: string; accountId: string; accountIds: string[]; status: string };
export function FundAssignmentSelect({ funds, accounts, initial = "" }: { funds: Fund[]; accounts: { id: string; number: string }[]; initial?: string }) {
  const [value, setValue] = useState(initial);
  const warning = fundAssignmentWarning(funds.find(f => f.id === value));
  return <>
    <label>Thiện pháp<select name="fundId" value={value} onChange={event => setValue(event.target.value)} required>
      <option value="" disabled>Chọn thiện pháp</option>
      {funds.map(f => <option key={f.id} value={f.id}>{fundOptionLabel(f, accounts)}{f.status === "ACTIVE" ? "" : f.status === "PAUSED" ? " (Tạm dừng)" : " (Đã đóng / Hoàn thành)"}</option>)}
    </select></label>
    {warning && <div className="notice" role="status">{warning}</div>}
  </>;
}
