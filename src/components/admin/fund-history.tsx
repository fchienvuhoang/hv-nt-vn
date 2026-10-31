"use client";
import { useState } from "react";
import { useAdminResource } from "@/lib/admin-api";
import { LoadingIndicator } from "@/components/loading-indicator";
import { dateTime } from "@/lib/domain";
import type { FundHistory } from "@/lib/fund-history";
export function FundHistoryPanel({fundId,active}:{fundId:string;active:boolean}){
  const [page,setPage]=useState(1);
  const {data,error,loading}=useAdminResource<FundHistory>(`fund-history?fundId=${encodeURIComponent(fundId)}&page=${page}`,20000,active);
  return <section className="fund-edit-history" aria-label="Lịch sử cấu hình thiện pháp">
    <p>Lưu người thực hiện, thời gian và nội dung thay đổi. Từ khóa thêm/bớt được ghi riêng; thay đổi mã chính nằm ở dòng Mã thiện pháp.</p>
    {loading&&<LoadingIndicator label="Đang tải lịch sử chỉnh sửa…" compact/>}
    {error&&<div role="alert" className="notice danger">{error}</div>}
    {data&&!loading&&data.total===0&&<p>Chưa có lịch sử chỉnh sửa được lưu cho thiện pháp này.</p>}
    {data?.rows.map(row=><article key={row.id} className="fund-history-entry">
      <header><strong>{row.label}</strong><time>{dateTime(row.at)}</time></header>
      <div className="fund-history-actor">{row.actorName||row.actor}<small>{row.actorName?row.actor:""}{row.actorId?` · ID: ${row.actorId}`:""}</small></div>
      {!!row.added.length&&<div className="fund-history-keywords added"><b>Thêm từ khóa:</b>{row.added.map(w=><code key={w}>+ {w}</code>)}</div>}
      {!!row.removed.length&&<div className="fund-history-keywords removed"><b>Xóa từ khóa:</b>{row.removed.map(w=><code key={w}>− {w}</code>)}</div>}
      {!!row.changes.length&&<div className="table-card"><table><thead><tr><th>Nội dung</th><th>Trước</th><th>Sau</th></tr></thead><tbody>{row.changes.map(change=><tr key={change.field}><th scope="row">{change.field}</th><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody></table></div>}
      {!row.added.length&&!row.removed.length&&!row.changes.length&&<small>Lưu cấu hình, không thay đổi giá trị được ghi nhận.</small>}
    </article>)}
    {data&&<div className="pagination"><span>{data.total} lượt · Trang {page}/{Math.max(1,Math.ceil(data.total/data.pageSize))}</span><div><button type="button" className="button subtle small" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}>← Trước</button><button type="button" className="button subtle small" disabled={loading||page*data.pageSize>=data.total} onClick={()=>setPage(p=>p+1)}>Sau →</button></div></div>}
  </section>;
}
