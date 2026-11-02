"use client";
import { useState } from "react";
import { FundActivityPanel } from "@/components/admin/fund-activity-panel";
import { TransactionSummaryPanel } from "@/components/admin/transaction-summary";
import { adminNavigate } from "@/components/admin/admin-link";
import { accountLabel } from "@/lib/account-label";
import type { AdminParams } from "@/lib/admin-navigation";
import type { AdminBootstrap } from "@/lib/admin-read-model";

export default function Statistics({ params, bootstrap }: { params: AdminParams; bootstrap?: AdminBootstrap }) {
  const [showTrend, setShowTrend] = useState(false);
  function change(key: string, value: string) {
    const next = new URLSearchParams(params as Record<string, string>);
    if (value) next.set(key, value); else next.delete(key);
    adminNavigate(`/admin?${next}`);
  }
  return <div className="statistics-workspace">
    <div className="sheet-toolbar"><h1>Thống kê thu chi</h1></div>
    <FundActivityPanel fundId={params.fund} account={params.account} filters={<>
      <select aria-label="Tài khoản thống kê" value={params.account ?? ""} onChange={event => change("account", event.target.value)}><option value="">Tất cả tài khoản</option>{bootstrap?.accounts.map(account => <option key={account.id} value={account.id}>{accountLabel(account.number)}</option>)}</select>
      <select aria-label="Thiện pháp thống kê" value={params.fund ?? ""} onChange={event => change("fund", event.target.value)}><option value="">Toàn bộ thiện pháp</option>{bootstrap?.funds.map(fund => <option key={fund.id} value={fund.id}>{fund.code} · {fund.name}</option>)}</select>
    </>}/>
    <details className="statistics-trend" onToggle={event => setShowTrend(event.currentTarget.open)}><summary>Biểu đồ thu chi 10 ngày gần đây</summary>{showTrend && <TransactionSummaryPanel/>}</details>
  </div>;
}
