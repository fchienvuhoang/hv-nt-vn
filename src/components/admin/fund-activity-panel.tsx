"use client";
import { useAdminResource } from "@/lib/admin-api";
import { localDate, vnd } from "@/lib/domain";
import type { FundActivity } from "@/lib/fund-activity";
import { AdminLink as Link, adminNavigate, useAdminParams } from "./admin-link";
import { LoadingIndicator } from "@/components/loading-indicator";

export function FundActivityPanel({ fundId = "", account = "", active = true, onNavigate }: { fundId?: string; account?: string; active?: boolean; onNavigate?: () => void }) {
  const params = useAdminParams(), date = params.reportDate || (params.from && params.from === params.to ? params.from : localDate()), allTime = params.reportAll === "1", expense = params.reportType === "DEBIT";
  const query = new URLSearchParams({ date, allTime: allTime ? "1" : "0", fundId, account });
  const { data, error, loading } = useAdminResource<FundActivity>(`fund-activity?${query}`, 20000, active);
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params as Record<string, string>);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    adminNavigate(`/admin?${next}`);
  }
  function details(direction: string, id = fundId, assignment = "") {
    return `/admin?${new URLSearchParams({ view: "transactions", type: direction, posted: "1", ...(allTime ? {} : { from: date, to: date }), ...(id ? { fund: id } : {}), ...(account ? { account } : {}), ...(assignment === "UNASSIGNED" ? { pending: "1" } : assignment ? { assignment } : {}), reportDate: date, ...(allTime ? { reportAll: "1" } : {}), reportType: direction })}`;
  }
  const cards: { key: "expense" | "auto" | "manual" | "unassigned"; label: string; assignment: string }[] = [
    { key: "expense", label: "Tổng chi", assignment: "" },
    { key: "auto", label: "Chi gán tự động", assignment: "AUTO" },
    { key: "manual", label: "Chi gán tay", assignment: "MANUAL" },
    ...(!fundId ? [{ key: "unassigned" as const, label: "Chi chưa phân loại", assignment: "UNASSIGNED" }] : []),
  ];
  return <section className="fund-activity-panel" aria-label={fundId ? "Thu chi của thiện pháp" : "Tổng hợp thu chi toàn bộ thiện pháp"} aria-busy={loading}>
    <div className="fund-activity-heading"><strong>{fundId ? "Thống kê thu / chi thiện pháp" : "Tổng quan thu / chi toàn hệ thống"}</strong><div>
      <label>Ngày <input type="date" value={date} onChange={event => { if (event.target.value) change({ reportDate: event.target.value, reportAll: "" }); }}/></label>
      <button type="button" className={`button subtle small${allTime ? " selected" : ""}`} onClick={() => change({ reportAll: allTime ? "" : "1" })}>{allTime ? "Đang xem toàn bộ thời gian" : "Toàn bộ thời gian"}</button>
      <button type="button" className="button subtle small" onClick={() => change({ reportDate: localDate(), reportAll: "" })}>Hôm nay</button>
    </div></div>
    <small>{allTime ? "Toàn bộ thời gian" : date.split("-").reverse().join("/")} · {account ? "Tài khoản đang chọn" : "Tất cả tài khoản"} · Chỉ khoản đã ghi nhận; không gồm số dư chuyển sang, nghi trùng và điều chuyển nội bộ.</small>
    <div className="fund-activity-cards">{cards.map(card => {
      const value = data?.total[card.key];
      return <Link onClick={onNavigate} key={card.key} href={details("DEBIT", fundId, card.assignment)}><span>{card.label}</span><strong>{value ? vnd(value.amount) : "—"}</strong><small>{value?.count ?? "—"} khoản · Xem giao dịch</small></Link>;
    })}</div>
    <div className="fund-activity-heading"><div className="tabs" aria-label="Thống kê theo thiện pháp"><button type="button" className={!expense ? "selected" : ""} onClick={() => change({ reportType: "CREDIT" })}>Thu theo thiện pháp</button><button type="button" className={expense ? "selected" : ""} onClick={() => change({ reportType: "DEBIT" })}>Chi theo thiện pháp</button></div><strong>{expense ? "Tổng chi" : "Tổng thu"}: {data ? vnd((expense ? data.total.expense : data.total.income).amount) : "—"}</strong></div>
    {error ? <p className="notice danger" role="alert">{error}</p> : !data ? <LoadingIndicator label="Đang tải thống kê thu chi…" compact/> : <div className="table-scroll"><table><thead><tr><th>Thiện pháp</th><th>{expense ? "Tổng chi" : "Tổng thu"}</th>{expense && <><th>Gán tự động</th><th>Gán tay</th><th>Chưa phân loại</th></>}</tr></thead><tbody>{data.funds.map(fund => {
      const value = expense ? fund.expense : fund.income;
      const href = fund.id ? details(expense ? "DEBIT" : "CREDIT", fund.id) : details(expense ? "DEBIT" : "CREDIT", "", "UNASSIGNED");
      return <tr key={fund.id}><td><Link onClick={onNavigate} href={href}><strong>{fund.code}</strong><small>{fund.name}</small></Link></td><td><Link onClick={onNavigate} href={href}>{vnd(value.amount)}<small>{value.count} khoản</small></Link></td>{expense && (["auto", "manual", "unassigned"] as const).map((key, index) => <td key={key}>{fund[key].count ? <Link onClick={onNavigate} href={details("DEBIT", fund.id, ["AUTO", "MANUAL", "UNASSIGNED"][index])}>{vnd(fund[key].amount)}<small>{fund[key].count} khoản</small></Link> : <span>0₫<small>0 khoản</small></span>}</td>)}</tr>;
    })}</tbody></table></div>}
    <small>Chọn số tiền để mở danh sách giao dịch. Khoản thu phân bổ nhiều thiện pháp chỉ tính đúng phần của từng thiện pháp; tổng số giao dịch toàn hệ thống không đếm lặp.</small>
  </section>;
}
