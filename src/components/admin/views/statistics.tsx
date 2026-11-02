"use client";
import { FundActivityPanel } from "@/components/admin/fund-activity-panel";
import { TransactionSummaryPanel } from "@/components/admin/transaction-summary";
import { accountLabel } from "@/lib/account-label";
import type { AdminParams } from "@/lib/admin-navigation";
import type { AdminBootstrap } from "@/lib/admin-read-model";

export default function Statistics({ params, bootstrap }: { params: AdminParams; bootstrap?: AdminBootstrap }) {
  return <div className="transaction-sheet">
    <div className="sheet-toolbar"><h1>Thống kê thu chi</h1></div>
    <TransactionSummaryPanel/>
    <form className="filter-bar" action="/admin" method="get" key={`${params.account ?? ""}:${params.fund ?? ""}`}>
      <input type="hidden" name="view" value="statistics"/>
      {["reportDate", "reportAll", "reportType"].map(key => params[key] && <input key={key} type="hidden" name={key} value={params[key]}/>)}
      <label>Tài khoản<select name="account" defaultValue={params.account ?? ""}><option value="">Tất cả tài khoản</option>{bootstrap?.accounts.map(account => <option key={account.id} value={account.id}>{accountLabel(account.number)}</option>)}</select></label>
      <label>Thiện pháp<select name="fund" defaultValue={params.fund ?? ""}><option value="">Toàn bộ thiện pháp</option>{bootstrap?.funds.map(fund => <option key={fund.id} value={fund.id}>{fund.code} · {fund.name}</option>)}</select></label>
      <button className="button primary" disabled={!bootstrap}>Áp dụng</button>
    </form>
    <FundActivityPanel fundId={params.fund} account={params.account}/>
  </div>;
}
