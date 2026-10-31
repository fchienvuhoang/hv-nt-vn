"use client";
import { useAdminResource } from "@/lib/admin-api";
import type { TransactionSummary } from "@/lib/transaction-summary";
import { vnd } from "@/lib/domain";
export function TransactionSummaryPanel(){
  const {data,error}=useAdminResource<TransactionSummary>("transaction-summary",20000);
  const days=[...(data?.days??[])].reverse();
  const maximum=days.reduce((max,d)=>[max,d.income,d.expense].reduce((a,b)=>a>b?a:b),0n);
  const width=(amount:bigint)=>`${maximum?Number(amount*10000n/maximum)/100:0}%`;
  return <section className="transaction-daily-summary" aria-label="Thu chi ba ngày gần đây">
    <div className="daily-summary-heading"><strong>Thu / chi 3 ngày gần đây</strong><small>Cả hai tài khoản · Giờ Việt Nam · Độc lập bộ lọc</small></div>
    <div className="transaction-daily-cards">
      {days.map(d=><article key={d.date} className={`transaction-day-card${d.date===data?.days[0].date?" today":""}`}>
        <h2>{d.date.split("-").reverse().join("/")}{d.date===data?.days[0].date&&<span>Hôm nay</span>}</h2>
        <div className="daily-chart-row"><div><span>Hùn phước <b>{d.incomeCount.toLocaleString("vi-VN")}</b> khoản</span><strong className="positive">{vnd(d.income)}</strong></div><div className="daily-chart-track" aria-hidden="true"><span className="daily-chart-income" style={{width:width(d.income)}} /></div></div>
        <div className="daily-chart-row"><div><span>Chi <b>{d.expenseCount.toLocaleString("vi-VN")}</b> khoản</span><strong className="negative">{vnd(d.expense)}</strong></div><div className="daily-chart-track" aria-hidden="true"><span className="daily-chart-expense" style={{width:width(d.expense)}} /></div></div>
      </article>)}
    </div>
    {!data&&!error&&<small role="status">Đang tải thống kê…</small>}
    <small className="transaction-stats-note">Cùng thang đo số tiền · Chỉ tính giao dịch đã ghi nhận; ngày chưa đồng bộ có thể chưa đầy đủ. Không tính nghi trùng và điều chuyển nội bộ.</small>
    {error&&<small role="alert" className="source-balance-warning">Chưa tải được thống kê: {error}</small>}
  </section>;
}
