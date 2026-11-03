"use client";
import { useId, useState } from "react";
import { LoadingIndicator } from "@/components/loading-indicator";

import { useAdminResource } from "@/lib/admin-api";
import type { TransactionSummary } from "@/lib/transaction-summary";
import { vnd } from "@/lib/domain";
export function TransactionSummaryPanel(){
  const {data,error}=useAdminResource<TransactionSummary>("transaction-summary",20000);
  const [expanded,setExpanded]=useState(false);
  const chartId=useId();
  const days=[...(data?.days??[]).slice(0,expanded?10:3)].reverse();
  const maximum=days.reduce((max,d)=>[max,d.income,d.expense].reduce((a,b)=>a>b?a:b),0n);
  const height=(amount:bigint)=>`${maximum?Number(amount*10000n/maximum)/100:0}%`;
  return <section className="transaction-daily-summary" aria-label={`Tiền vào và tiền ra ${expanded?10:3} ngày gần đây`}>
    <div className="daily-summary-heading"><strong>Tiền vào / Tiền ra · {expanded?10:3} ngày gần đây</strong><small>Cả hai tài khoản · Giờ Việt Nam · Độc lập bộ lọc</small></div>
    <div className="daily-column-legend"><span><i className="daily-chart-income"/> Tiền vào</span><span><i className="daily-chart-expense"/> Tiền ra</span></div>
    <div id={chartId} className="daily-column-scroll" tabIndex={0} role="region" aria-label="Biểu đồ tiền vào và tiền ra theo ngày"><div className="daily-column-chart" style={{gridTemplateColumns:`repeat(${days.length||3},minmax(120px,1fr))`}}>
      {days.map(d=><article key={d.date} className={`daily-column-day${d.date===data?.days[0].date?" today":""}`}>
        <div className="daily-column-bars">
          <div className="daily-column-slot"><div className="daily-chart-income" style={{height:height(d.income)}} title={`Tiền vào: ${vnd(d.income)} · ${d.incomeCount} khoản`} /></div>
          <div className="daily-column-slot"><div className="daily-chart-expense" style={{height:height(d.expense)}} title={`Tiền ra: ${vnd(d.expense)} · ${d.expenseCount} khoản`} /></div>
        </div>
        <h2>{d.date.slice(8)}/{d.date.slice(5,7)}{d.date===data?.days[0].date&&<span>Hôm nay</span>}</h2>
        <div className="daily-column-values"><span className="positive" title={`${d.incomeCount} giao dịch tiền vào`}>Tiền vào: {vnd(d.income)} <small>({d.incomeCount})</small></span><span className="negative" title={`${d.expenseCount} giao dịch tiền ra`}>Tiền ra: {vnd(d.expense)} <small>({d.expenseCount})</small></span></div>
      </article>)}
    </div></div>
    {data&&data.days.length>3&&<button type="button" className="button subtle small daily-summary-toggle" aria-expanded={expanded} aria-controls={chartId} onClick={()=>setExpanded(value=>!value)}>{expanded?"Thu gọn còn 3 ngày":"Xem thêm 7 ngày"}</button>}
    {!data&&!error&&<LoadingIndicator label="Đang tải thống kê…" compact/>}
    <small className="transaction-stats-note">Cùng thang đo số tiền · Chỉ tính giao dịch đã ghi nhận; ngày chưa đồng bộ có thể chưa đầy đủ. Không tính nghi trùng và điều chuyển nội bộ.</small>
    {error&&<small role="alert" className="source-balance-warning">Chưa tải được thống kê: {error}</small>}
  </section>;
}
