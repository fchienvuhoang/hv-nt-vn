"use client";
import { useState } from "react";
import {FundPicker} from "./fund-picker";
import { fundAssignmentWarning } from "@/lib/fund-assignment-warning";
type Fund = { id: string; code: string; name: string; accountId: string; accountIds: string[]; status: string };
export function FundAssignmentSelect({ funds, accounts, initial = "" }: { funds: Fund[]; accounts: { id: string; number: string }[]; initial?: string }) {
  const [value, setValue] = useState(initial);
  const warning = fundAssignmentWarning(funds.find(f => f.id === value));
  return <>
    <label>Thiện pháp<FundPicker name="fundId" funds={funds} accounts={accounts} value={value} onChange={setValue} required/></label>
    {warning && <div className="notice" role="status">{warning}</div>}
  </>;
}
