"use client";
import type { ReactNode, MouseEvent } from "react";
import { useAdminResource } from "@/lib/admin-api";
import { localDate, startOfVietnamDay, vnd } from "@/lib/domain";
import type { FundActivity } from "@/lib/fund-activity";
import { AdminLink as Link, adminNavigate, useAdminParams } from "./admin-link";
import { LoadingIndicator } from "@/components/loading-indicator";

export function FundActivityPanel({ fundId = "", account = "", active = true, onNavigate, filters }: { fundId?: string; account?: string; active?: boolean; onNavigate?: () => void; filters?: ReactNode }) {
  const params = useAdminParams(), today = localDate(), yesterday = localDate(new Date(startOfVietnamDay(today).getTime() - 86400000));
  const date = params.reportDate || (params.from && params.from === params.to ? params.from : today), allTime = params.reportAll === "1", breakdown = params.reportBreakdown === "1";
  const query = new URLSearchParams({ date, allTime: allTime ? "1" : "0", fundId, account });
  const { data, error, loading } = useAdminResource<FundActivity>(`fund-activity?${query}`, 20000, active, true);
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (loading) { event.preventDefault(); return; }
    onNavigate?.();
  }
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params as Record<string, string>);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    adminNavigate(`/admin?${next}`);
  }
  function details(direction: string, id = fundId, assignment = "") {
    return `/admin?${new URLSearchParams({ view: "transactions", type: direction, posted: "1", ...(allTime ? {} : { from: date, to: date }), ...(id ? { fund: id } : {}), ...(account ? { account } : {}), ...(assignment === "UNASSIGNED" ? { pending: "1" } : assignment ? { assignment } : {}), reportDate: date, ...(allTime ? { reportAll: "1" } : {}) })}`;
  }
  function amount(value: { count: number; amount: bigint }, direction: string, id: string, assignment = "") {
    const content = <><strong>{vnd(value.amount)}</strong><small>{value.count} khoản</small></>;
    return value.count ? <Link onClick={follow} href={details(direction, id, assignment)}>{content}</Link> : <span className="activity-zero">{content}</span>;
  }
  const summaries: { key: keyof FundActivity["total"]; label: string; direction: string; assignment: string }[] = [
    { key: "income", label: "Tổng thu", direction: "CREDIT", assignment: "" },
    { key: "expense", label: "Tổng chi", direction: "DEBIT", assignment: "" },
    { key: "auto", label: "Chi tự động", direction: "DEBIT", assignment: "AUTO" },
    { key: "manual", label: "Chi gán tay", direction: "DEBIT", assignment: "MANUAL" },
    ...(!fundId ? [{ key: "unassigned" as const, label: "Chi chưa phân loại", direction: "DEBIT", assignment: "UNASSIGNED" }] : []),
  ];
  return <section className="fund-activity-panel" aria-label={fundId ? "Thu chi của thiện pháp" : "Tổng hợp thu chi toàn bộ thiện pháp"} aria-busy={loading}>
    <div className="activity-toolbar">
      {filters}
      <div className="activity-period" aria-label="Kỳ thống kê">
        {[{ label: "Tổng", selected: allTime, values: { reportAll: "1", reportDate: date } }, { label: "Hôm qua", selected: !allTime && date === yesterday, values: { reportAll: "", reportDate: yesterday } }, { label: "Hôm nay", selected: !allTime && date === today, values: { reportAll: "", reportDate: today } }].map(item => <button type="button" key={item.label} aria-pressed={item.selected} className={item.selected ? "selected" : ""} onClick={() => change(item.values)}>{item.label}</button>)}
      </div>
      <label className="activity-calendar"><span>Chọn ngày</span><input aria-label="Chọn ngày thống kê" type="date" value={date} onChange={event => { if (event.target.value) change({ reportDate: event.target.value, reportAll: "" }); }}/></label>
      <button className={`button subtle small${breakdown ? " selected" : ""}`} type="button" aria-pressed={breakdown} onClick={() => change({ reportBreakdown: breakdown ? "" : "1" })}>Chi tiết cách gán</button>
    </div>
    <div className="activity-summary-strip">{summaries.map(item => <Link key={item.key} onClick={follow} href={details(item.direction, fundId, item.assignment)}><span>{item.label}</span><strong>{data ? vnd(data.total[item.key].amount) : "—"}</strong></Link>)}</div>
    <div className="activity-table-caption"><strong>{allTime ? "Tổng toàn bộ thời gian" : `Ngày ${date.split("-").reverse().join("/")}`}</strong><span>{data ? `${data.funds.length} thiện pháp / nhóm` : "Đang tải…"}</span><span className="activity-updating" role="status">{loading && data ? "Đang cập nhật…" : ""}</span></div>
    {error ? <p className="notice danger" role="alert">{error}</p> : !data ? <LoadingIndicator label="Đang tải thống kê thu chi…" compact/> : <div className={`activity-table-wrap${breakdown ? " has-breakdown" : ""}`}><table className="activity-table"><colgroup><col className="activity-code-col"/><col/><col className="activity-money-col"/><col className="activity-money-col"/>{breakdown && <><col className="activity-money-col"/><col className="activity-money-col"/></>}</colgroup><thead><tr><th className="activity-code">Mã</th><th>Thiện pháp</th><th className="activity-number">Tổng thu</th><th className="activity-number">Tổng chi</th>{breakdown && <><th className="activity-number">Chi tự động</th><th className="activity-number">Chi gán tay</th></>}</tr></thead><tbody>{data.funds.map(fund => <tr key={fund.id}>
      <td className="activity-code" title={fund.code}><strong>{fund.id ? fund.code : "—"}</strong></td>
      <td className="activity-fund-name" title={fund.name}><Link onClick={follow} href={fund.id ? details("CREDIT", fund.id) : details("CREDIT", "", "UNASSIGNED")}><b className="activity-mobile-code">{fund.id ? fund.code : ""} </b>{fund.name}</Link></td>
      <td className="activity-number">{amount(fund.income, "CREDIT", fund.id, fund.id ? "" : "UNASSIGNED")}</td>
      <td className="activity-number">{amount(fund.expense, "DEBIT", fund.id, fund.id ? "" : "UNASSIGNED")}</td>
      {breakdown && <><td className="activity-number">{amount(fund.auto, "DEBIT", fund.id, "AUTO")}</td><td className="activity-number">{amount(fund.manual, "DEBIT", fund.id, "MANUAL")}</td></>}
    </tr>)}</tbody><tfoot><tr><th className="activity-code"/><th>Tổng cộng</th><td className="activity-number"><strong>{vnd(data.total.income.amount)}</strong></td><td className="activity-number"><strong>{vnd(data.total.expense.amount)}</strong></td>{breakdown && <><td className="activity-number"><strong>{vnd(data.total.auto.amount)}</strong></td><td className="activity-number"><strong>{vnd(data.total.manual.amount)}</strong></td></>}</tr></tfoot></table></div>}
    <p className="activity-footnote">Bấm số tiền để xem giao dịch. Chỉ tính khoản đã ghi nhận, không gồm số dư chuyển sang, nghi trùng và điều chuyển nội bộ. Thu phân bổ tính đúng phần của từng thiện pháp.</p>
  </section>;
}
