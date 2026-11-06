"use client";
import { accountLabel, fundOptionLabel } from "@/lib/account-label";
import { useRef, useState } from "react";
import { useToast } from "@/components/toasts";
import { bulkAssignTransactions } from "@/lib/admin-api";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading-indicator";

import { FundActivityPanel } from "@/components/admin/fund-activity-panel";
import { TransactionSummaryPanel } from "@/components/admin/transaction-summary";
import { useAdminResource } from "@/lib/admin-api";
import type { AdminTransactions,AdminBootstrap } from "@/lib/admin-read-model";
import { TransactionNoteEditor } from "@/components/admin/transaction-note-editor";
import { TabReclassification } from "@/components/admin/tab-reclassification";
import type { ReclassificationScope } from "@/lib/reclassify";
import { TransactionTabs } from "@/components/admin/transaction-tabs";
import { transactionDates } from "@/lib/transaction-scope";
import { SyncRecency } from "@/components/admin/sync-recency";
import { EntryReview } from "@/components/admin/entry-review";
import { Modal } from "@/components/modal";
import {
  Empty,
  Pagination,
  pageNumber,
} from "@/components/ui";
import { dateTime, localDate, vnd, fundUsesAccount } from "@/lib/domain";
import {AdminLink as Link} from "@/components/admin/admin-link";
import { ActionForm } from "@/components/action-form";
import { assignTransaction } from "@/lib/admin-api";
type TransactionParams={page?:string;pending?:string;account?:string;q?:string;type?:string;fund?:string;review?:string;from?:string;to?:string;assignment?:string;posted?:string};
export default function Transactions({params,bootstrap}:{params:TransactionParams;bootstrap?:AdminBootstrap}) {
  const range=transactionDates(params.from,params.to),page=pageNumber(params.page),pageSize=100,query=(params.q??"").slice(0,100);
  const direction=params.type==="CREDIT"||params.type==="DEBIT"?params.type:undefined;
  const apiParams=new URLSearchParams(Object.entries({...params,from:range.from,to:range.to}).filter(([,v])=>v!==undefined&&v!=="") as [string,string][]);
  for(const key of ["reportDate","reportAll","reportType"])apiParams.delete(key);
  apiParams.delete("review");apiParams.delete("view");apiParams.delete("modal");apiParams.delete("fundId");apiParams.sort();
  const {data,loading,error}=useAdminResource<AdminTransactions>(`transactions?${apiParams}`);
  type SelectedRow=AdminTransactions["rows"][number];
  const selectionScope=apiParams.toString();
  const [selection,setSelection]=useState<{scope:string;rows:Map<string,SelectedRow>}>({scope:"",rows:new Map()});
  const selected=selection.scope===selectionScope?selection.rows:new Map<string,SelectedRow>();
  const [target,setTarget]=useState(""),[reason,setReason]=useState(""),[busy,setBusy]=useState(false);
  const operation=useRef<{signature:string;id:string}|null>(null),toast=useToast();
  const eligible=(row:SelectedRow)=>row.entryStatus==="POSTED"&&(!row.allocations.length||!!params.fund);
  function toggleSelection(row:SelectedRow){setSelection(previous=>{const next=new Map(previous.scope===selectionScope?previous.rows:[]);if(next.has(row.id))next.delete(row.id);else next.set(row.id,row);return {scope:selectionScope,rows:next}})}
  async function assignSelected(){
    if(!selected.size||!target||reason.trim().length<5){toast("Chọn thiện pháp và nhập lý do ít nhất 5 ký tự.","error");return}
    const payload={...(params.pending==="1"?{sourceFundId:null}:params.fund?{sourceFundId:params.fund}:{}),targetFundId:target,reason:reason.trim(),rows:[...selected.values()].map(r=>({id:r.id,updatedAt:r.updatedAt.toISOString()}))};
    const signature=JSON.stringify(payload);if(operation.current?.signature!==signature)operation.current={signature,id:crypto.randomUUID()};
    setBusy(true);
    try{const result=await bulkAssignTransactions({...payload,requestId:operation.current.id});if(result.error)throw new Error(result.error);toast(result.success??`Đã gán thủ công ${selected.size} giao dịch`);setSelection({scope:selectionScope,rows:new Map()});setReason("");setTarget("");operation.current=null}
    catch(error){toast(error instanceof Error?error.message:"Không thể gán giao dịch","error")}
    finally{setBusy(false)}
  }
  const rows=data?.rows??[],accounts=data?.accounts??bootstrap?.recency??[],funds=data?.funds??bootstrap?.funds??[];
  const historyCounts=new Map((data?.history??[]).map(group=>[group.fundId,group]));
  const isWrongAccount=(r:SelectedRow)=>r.matchReason.startsWith("Sai tài khoản nhận:");
  const selectedRows=[...selected.values()];
  const wrongAccountRows=selectedRows.filter(isWrongAccount);
  const hasWrongAccount=wrongAccountRows.length>0;
  const eligibleFunds=funds.filter(f=>selectedRows.every(r=>fundUsesAccount(f,r.accountId)));
  const effectiveTarget=eligibleFunds.some(f=>f.id===target)?target:"";
  const today=localDate(),totalCount=data?.total??0,pendingCount=data?.pending??0,count=data?.count??0;
  const baseParams = new URLSearchParams({
    view: "transactions",
    ...(range.from?{from:range.from}:{}), ...(range.to?{to:range.to}:{}),
    ...(params.pending ? { pending: params.pending } : {}),
    ...(params.account ? { account: params.account } : {}),
    ...(query ? { q: query } : {}),
    ...(direction ? { type: direction } : {}),
    ...(params.fund ? { fund: params.fund } : {}),
    ...(params.assignment ? { assignment: params.assignment } : {}),
    ...(params.posted ? { posted: params.posted } : {}),
  });
  const tabParams = new URLSearchParams(baseParams);
  tabParams.delete("pending"); tabParams.delete("fund");
  const tabScope: ReclassificationScope | null = params.pending === "1" || params.fund ? {
    tab: params.pending === "1" ? "PENDING" : "FUND", ...(params.pending === "1" ? {} : { fundId: params.fund }),
    from: range.from, to: range.to, account: params.account ?? "", type: direction ?? "", q: query,
  } : null;
  const canReclassify = tabScope && !range.error && !params.assignment;
  const tabLabel = params.pending === "1" ? "Chưa phân loại" : funds.find(f=>f.id===params.fund)?.code ?? "Thiện pháp";
  return (
    <div className="transaction-sheet">
      <div className="sheet-toolbar">
        <h1>Giao dịch <span>{data?count.toLocaleString("vi-VN"):"…"}</span></h1>
        <SyncRecency initial={accounts} initialNow={accounts[0]?.checkedAt ?? 0} />
      </div>
      <TransactionSummaryPanel />
      {params.fund&&params.pending!=="1"&&<FundActivityPanel fundId={params.fund} account={params.account}/>}
      {error&&<div className="notice danger" role="alert">{error}</div>}
      {loading&&data&&<LoadingIndicator label="Đang tải dữ liệu giao dịch…" compact className="admin-data-loading"/>}
      {range.error && <div className="notice danger" role="alert">{range.error}</div>}
      <TransactionTabs loading={!data} funds={funds.map(f=>{const h=historyCounts.get(f.id); const last=h?.to?localDate(new Date(h.to)):today; return {id:f.id,code:f.code,name:f.name,status:f.status,count:h?.count??0,from:h?.from?localDate(new Date(h.from)):range.from,to:last>today?last:today};})} total={totalCount} pending={pendingCount} selectedCount={data?.selectedTotal??0} selectedFund={params.fund} isPending={params.pending === "1"} base={tabParams.toString()} />
      <div className="transaction-filter-summary"><span>Đang hiển thị <strong>{data?(`${count.toLocaleString("vi-VN")}/${data.selectedTotal.toLocaleString("vi-VN")}`):"…"}</strong> giao dịch · {range.allTime?"Toàn bộ thời gian":range.from===range.to?`Ngày ${range.from.split("-").reverse().join("/")}`:`${range.from.split("-").reverse().join("/")} → ${range.to.split("-").reverse().join("/")}`}</span><div><Link className={`button subtle small${range.allTime?" selected":""}`} href={(()=>{const p=new URLSearchParams(baseParams);p.delete("from");p.delete("to");return `/admin?${p}`})()}>Toàn bộ thời gian</Link><Link className="button subtle small" href={(()=>{const p=new URLSearchParams(baseParams);p.set("from",today);p.set("to",today);return `/admin?${p}`})()}>Hôm nay</Link><Link className="button subtle small" href={`/admin?${new URLSearchParams({view:"transactions",...(params.pending?{pending:"1"}:params.fund?{fund:params.fund}:{})})}`}>Xóa bộ lọc</Link></div></div>
      {tabScope && <div className="transaction-tab-actions" aria-label={`Thao tác tab ${tabLabel}`}>
        <span>Tab <strong>{tabLabel}</strong> · {count.toLocaleString("vi-VN")} giao dịch theo bộ lọc</span>
        {canReclassify ? <TabReclassification key={JSON.stringify(tabScope)} scope={tabScope} initial={null} label={tabLabel} count={count} filterLabel={`${params.account ? "TK " + accountLabel(accounts.find(a=>a.id===params.account)?.number ?? params.account) : "Cả hai tài khoản"} · ${direction === "CREDIT" ? "Thu" : direction === "DEBIT" ? "Chi" : "Thu và chi"}${query ? ` · Tìm kiếm: ${query}` : ""}`} /> : <small>Bỏ bộ lọc cách gán để kiểm tra phân loại toàn tab.</small>}
      </div>}
      <section className="sheet-panel" aria-label="Danh sách giao dịch">
        <form key={apiParams.toString()} className="filter-bar" action="/admin" method="get">
          <input type="hidden" name="view" value="transactions" />
          {params.posted&&<input type="hidden" name="posted" value={params.posted}/>}
          {params.pending === "1" ? <input type="hidden" name="pending" value="1" /> : params.fund ? <input type="hidden" name="fund" value={params.fund} /> : null}
          <label>
            Tìm kiếm
            <input
              name="q"
              placeholder="Nội dung hoặc mã giao dịch"
              defaultValue={query}
            />
          </label>
          <label>Từ ngày<input type="date" name="from" defaultValue={range.from} /></label>
          <label>Đến ngày<input type="date" name="to" defaultValue={range.to} /></label>
          <label>
            Tài khoản
            <select name="account" defaultValue={params.account ?? ""}>
              <option value="">Tất cả tài khoản</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a.number)} · {a.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Thu / chi
            <select name="type" defaultValue={direction ?? ""}>
              <option value="">Tất cả</option>
              <option value="CREDIT">Thu</option>
              <option value="DEBIT">Chi</option>
            </select>
          </label>
          <label>Cách gán<select name="assignment" defaultValue={params.assignment??""}><option value="">Tất cả</option><option value="AUTO">Gán tự động</option><option value="MANUAL">Gán tay</option></select></label>
          <button className="button primary">Lọc</button>
        </form>
        <div className="sheet-record-count" role="status" aria-live="polite">
          <span><strong>{data?count.toLocaleString("vi-VN"):"…"}</strong> giao dịch{(!range.allTime||params.account||query||direction)?" theo bộ lọc":""}</span>
          {data&&<small>{rows.length?`Đang xem ${(page-1)*pageSize+1}–${(page-1)*pageSize+rows.length}`:"Không có dòng hiển thị"} · {rows.length} dòng trên trang này</small>}
        </div>
        <fieldset className="sheet-bulk-actions" disabled={busy}>
          <div className="sheet-bulk-totals" aria-live="polite"><strong>Đã chọn {selected.size} giao dịch</strong><span>Thu: <b>{vnd([...selected.values()].filter(r=>r.direction==="CREDIT").reduce((sum,r)=>sum+r.amount,0n))}</b> · Chi: <b>{vnd([...selected.values()].filter(r=>r.direction==="DEBIT").reduce((sum,r)=>sum+r.amount,0n))}</b></span></div>
          {hasWrongAccount&&<div className="notice wrong-account-bulk-notice" role="status"><strong>{wrongAccountRows.length} giao dịch</strong> đã chọn bị đánh dấu <strong>Sai tài khoản nhận</strong> — có thể gán vào thiện pháp nhận nhiều tài khoản hoặc thiện pháp nhận một tài khoản trùng với tài khoản giao dịch. Danh sách bên dưới chỉ hiện thiện pháp hỗ trợ tất cả tài khoản đã chọn.</div>}
          <label>Gán thủ công vào thiện pháp<select value={effectiveTarget} onChange={e=>setTarget(e.target.value)}><option value="">Chọn thiện pháp nhận…</option>{eligibleFunds.map(f=><option key={f.id} value={f.id}>{fundOptionLabel(f,accounts)}</option>)}</select></label>
          <label>Lý do chung / ghi chú công khai<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} placeholder="Ví dụ: nội dung thiếu mã thiện pháp"/></label>
          <button type="button" className="button primary small" disabled={!selected.size||!effectiveTarget||reason.trim().length<5||loading} onClick={assignSelected}>{busy?<><LoadingSpinner size={16}/>Đang gán…</>:`Gán ${selected.size} giao dịch`}</button>
          <button type="button" className="button subtle small" disabled={!selected.size} onClick={()=>setSelection({scope:selectionScope,rows:new Map()})}>Bỏ chọn</button>
        </fieldset>
        <Pagination page={page} total={count} pageSize={pageSize} base={`/admin?${baseParams}`} />
        {loading&&!data?<LoadingIndicator label="Đang tải các giao dịch…"/>:!rows.length ? (
          <Empty title="Không có giao dịch phù hợp" />
        ) : (
          <div className="table-scroll table-card sheet-scroll transaction-mobile-list" tabIndex={0} role="region" aria-label="Bảng giao dịch">
            <table className="sheet-table" role="table">
              <colgroup><col className="sheet-col-select"/><col className="sheet-col-index" /><col className="sheet-col-time" /><col className="sheet-col-account" /><col className="sheet-col-ref" /><col className="sheet-col-narrative" /><col className="sheet-col-money" /><col className="sheet-col-fund" /><col className="sheet-col-action" /></colgroup>
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col"><input type="checkbox" aria-label="Chọn tất cả giao dịch có thể gán trên trang này" disabled={busy||loading||!rows.some(eligible)} checked={rows.some(eligible)&&rows.filter(eligible).every(r=>selected.has(r.id))} onChange={e=>setSelection({scope:selectionScope,rows:e.target.checked?new Map(rows.filter(eligible).map(r=>[r.id,r])):new Map()})}/></th>
                  <th scope="col">#</th>
                  <th scope="col">Thời gian</th>
                  <th scope="col">TK</th>
                  <th scope="col">Mã giao dịch</th>
                  <th scope="col"><span className="transaction-desktop-label">Nội dung gốc / người chuyển</span><span className="transaction-mobile-label">Giao dịch · Số tiền</span></th>
                  <th className="align-right">Số tiền</th>
                  <th scope="col">Thiện pháp</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {rows.map((r, index) => (
                  <tr role="row" key={r.id} className={r.entryStatus === "REVIEW" ? "sheet-review" : undefined}>
                    <td className={selected.has(r.id)?"sheet-selected-check":""}><input type="checkbox" aria-label={`Chọn giao dịch ${r.refId||r.id}`} checked={selected.has(r.id)} disabled={busy||loading||!eligible(r)} title={r.entryStatus==="OPENING"?"Số dư chuyển sang từ Excel":!eligible(r)?"Giao dịch tách: chọn tab thiện pháp để gán phần phân bổ":"Chọn để gán thủ công"} onChange={()=>toggleSelection(r)}/></td>
                    <td className="sheet-index">{(page - 1) * pageSize + index + 1}</td>
                    <td className="nowrap sheet-time-cell">
                      {r.dateUnknown?"Chưa có ngày trong Excel":dateTime(r.occurredAt)}
                    </td>
                    <td className="sheet-account-cell" title={r.account.owner}>{accountLabel(r.account.number)}</td>
                    <td className="sheet-reference-cell"><span className="transaction-mobile-label">Mã GD: </span><span className="sheet-clip sheet-ref" title={r.refId}>{r.refId || "—"}</span></td>
                    <td className="sheet-content-cell">
                      <p className="sheet-narrative">{r.narrative || "Không có nội dung"}</p>
                      <div className="sheet-content-meta">
                        {r.displayName && <span className="sheet-sender"><span>Người giao dịch:</span> <strong>{r.displayName}</strong></span>}
                        <span className="sheet-source">{r.entryStatus==="OPENING"?"Số dư chuyển sang đầu tháng":r.origin === "EXCEL" ? "Nhập Excel" : "Sao kê"}</span>
                      </div>
                      {r.notes.map(note=><div key={note.id} className="transaction-admin-note"><strong>Ghi chú quản trị:</strong> {note.text}<small>{note.actorName||note.actor} · {dateTime(note.createdAt)}</small></div>)}
                    </td>
                    <td
                      className={`align-right money nowrap ${r.direction === "CREDIT" ? "positive" : ""}`}
                    >
                      {r.direction === "CREDIT" ? "+" : "−"}
                      {vnd(r.amount)}
                    </td>
                    <td className="classification-cell">
                      {r.allocations.length&&!params.fund?<div className="transaction-allocation-labels">{r.allocations.map(a=><span key={a.id} className="badge active">{a.fund.code} · {vnd(a.amount)}</span>)}</div>:<span className={`badge ${r.fund?"active":"pending"}`}>{r.fund?.code??"Chờ phân loại"}</span>}
                      {r.matchReason.startsWith("Sai tài khoản nhận:")&&<span className="account-mismatch-warning" role="status" title={r.matchReason}>Sai tài khoản nhận · Cần phân loại thủ công</span>}
                      <span className="sheet-assignment" title={`${r.assignment === "MANUAL" ? "Gán tay" : r.assignment === "AUTO" ? "Tự động" : "Chưa gán"} · ${r.matchReason}`}>
                        {r.assignment === "MANUAL" ? "Tay" : r.assignment === "AUTO" ? "Tự động" : ""}
                      </span>
                    </td>
                    <td className="sheet-row-actions">
                      {r.entryStatus==="POSTED"&&<TransactionNoteEditor transactionId={r.id} narrative={r.narrative}/>}
                      {r.entryStatus==="OPENING"?<span className="badge neutral">Số dư chuyển sang</span>:r.entryStatus === "REVIEW" ? (
                        <EntryReview entry={r} funds={funds} accounts={accounts} />
                      ) : r.entryStatus === "MERGED" ? (
                        <span className="badge neutral">
                          Đã đối chiếu — không tính lặp
                        </span>
                      ) : r.allocations.length&&!params.fund ? <small>Chọn tab thiện pháp để đổi phần phân bổ.</small> : (
                        <Modal
                          title={
                            r.fund
                              ? "Đổi thiện pháp cho giao dịch"
                              : "Phân loại giao dịch bằng tay"
                          }
                          description="Chọn thiện pháp để gán. Tài khoản nguồn và số tiền của giao dịch được giữ nguyên."
                          trigger={r.fund ? "Đổi thiện pháp" : "Gán bằng tay"}
                          triggerClassName="button subtle small"
                        >
                          <div className="modal-context">
                            <strong>{vnd(r.amount)}</strong>
                            <small>
                              {r.dateUnknown?"Chưa có ngày trong Excel":dateTime(r.occurredAt)} · Tài khoản{" "}
                              {accountLabel(r.account.number)}
                            </small>
                            <p>{r.narrative}</p>
                          </div>
                          <ActionForm
                            action={assignTransaction}
                            closeOnSuccess
                            label="Xác nhận gán"
                          >
                            <input
                              type="hidden"
                              name="transactionId"
                              value={r.id}
                            />
                            {params.fund&&<input type="hidden" name="sourceFundId" value={params.fund}/>}
                            <label>
                              Thiện pháp
                              <select
                                name="fundId"
                                defaultValue={r.fund?.id ?? ""}
                                required
                              >
                                <option value="" disabled>
                                  Chọn thiện pháp
                                </option>
                                {funds
                                  .filter((f) => fundUsesAccount(f,r.accountId))
                                  .map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {fundOptionLabel(f,accounts)}
                                      {f.status === "ACTIVE"
                                        ? ""
                                        : f.status === "PAUSED"
                                          ? " (Tạm dừng)"
                                          : " (Hoàn thành)"}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              Lý do
                              <input
                                name="reason"
                                required
                                minLength={5}
                                maxLength={1000}
                                placeholder="Lý do phân loại / điều chỉnh"
                              />
                            </label>
                          </ActionForm>
                        </Modal>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={count} pageSize={pageSize} base={`/admin?${baseParams}`} />
      </section>
    </div>
  );
}
