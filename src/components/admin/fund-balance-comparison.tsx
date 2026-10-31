"use client";
import { LoadingIndicator } from "@/components/loading-indicator";

import type { AdminBootstrap } from "@/lib/admin-read-model";
import { ExternalLink } from "lucide-react";
import { dateTime,vnd } from "@/lib/domain";
const accountLinks:Record<string,string>={"0572":"https://thiennguyen.app/user/hvnguyenthuyvnhotritambao?tab=TRANSACTIONS","0856":"https://thiennguyen.app/user/hvnguyenthuyvnphungsucongdong?tab=TRANSACTIONS"};
export function FundBalanceComparison({bootstrap}:{bootstrap?:AdminBootstrap}){
  const accounts=bootstrap?.balances??[],funds=bootstrap?.funds??[];
  const income=funds.reduce((n,f)=>n+f.income,0n),expense=funds.reduce((n,f)=>n+f.expense,0n),allocated=funds.reduce((n,f)=>n+f.balance,0n),adjustment=allocated-(income-expense);
  const source=(a:typeof accounts[number])=>a.sourceTotalCredit!==null&&a.sourceTotalDebit!==null?a.sourceTotalCredit-a.sourceTotalDebit:null;
  const complete=!!bootstrap&&accounts.length>0&&accounts.every(a=>source(a)!==null);
  const total=complete?accounts.reduce((n,a)=>n+source(a)!,0n):null,difference=total!==null?total-allocated:null;
  const gap=(value:bigint|null)=>value===null?"Chưa đủ dữ liệu":value===0n?"Khớp số liệu":`${value>0n?"+":""}${vnd(value)}`;
  return <section className="fund-reconciliation" aria-label="Đối chiếu số dư nguồn và phân bổ thiện pháp">
    <div className="fund-reconciliation-grid">
      <article className="fund-reconciliation-card source"><h2>Số dư theo Thiện Nguyện</h2><strong className="reconciliation-total">{total!==null?vnd(total):"Chưa đủ dữ liệu"}</strong><small>Tổng thu − tổng chi từ hai trang nguồn</small>
        <div className="reconciliation-accounts">{accounts.map(a=><div key={a.id}><div>{accountLinks[a.number]?<a href={accountLinks[a.number]} target="_blank" rel="noopener noreferrer" className="source-account-link" aria-label={`Mở sao kê Thiện Nguyện TK ${a.number} (tab mới)`}><b>TK {a.number}</b><ExternalLink size={12}/></a>:<b>TK {a.number}</b>}<strong>{source(a)!==null?vnd(source(a)!):"Chưa có dữ liệu"}</strong></div><small>Thu {a.sourceTotalCredit!==null?vnd(a.sourceTotalCredit):"—"} · Chi {a.sourceTotalDebit!==null?vnd(a.sourceTotalDebit):"—"}</small><small className={a.sourceError?"source-balance-warning":""}>{a.sourceFetchedAt?`Lấy lúc ${dateTime(a.sourceFetchedAt)}`:"Chờ webhook đồng bộ"}{a.sourceError?" · Lấy nguồn bị lỗi":""}</small></div>)}</div>
      </article>
      <article className="fund-reconciliation-card allocated"><h2>Số dư trong các thiện pháp</h2><strong className="reconciliation-total">{bootstrap?vnd(allocated):"…"}</strong><small>Hùn phước {vnd(income)} − đã chi {vnd(expense)}{adjustment!==0n?` · Điều chỉnh/điều chuyển lịch sử ${vnd(adjustment)}`:""}</small>
        <div className="reconciliation-accounts">{accounts.map(a=><div key={a.id}><div><b>TK {a.number}</b><strong>{vnd(a.fundBalance)}</strong></div><small>Đã phân bổ vào các thiện pháp</small><small className={source(a)!==null&&source(a)!==a.fundBalance?"source-balance-warning":""}>Chênh lệch nguồn − phân bổ: <b>{gap(source(a)!==null?source(a)!-a.fundBalance:null)}</b></small></div>)}</div>
      </article>
    </div>
    <div className={`reconciliation-difference${difference===0n?" matched":difference===null?"":" unmatched"}`} role="status"><span>Chênh lệch tổng <small>(nguồn − phân bổ thiện pháp)</small></span><strong>{gap(difference)}</strong></div>
    <small className="reconciliation-note">Tính tất cả thiện pháp, gồm hoàn thành/tạm dừng, không phụ thuộc bộ lọc. Giao dịch chưa phân loại chưa nằm trong số dư thiện pháp; chênh lệch có thể do chưa nhập đủ lịch sử hoặc chưa phân loại.</small>
    {!bootstrap&&<LoadingIndicator label="Đang tải đối chiếu…" compact/>}
  </section>;
}
