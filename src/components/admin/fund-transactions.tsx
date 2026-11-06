"use client";
import { fundAssignmentWarning } from "@/lib/fund-assignment-warning";
import {TransferAllocationInfo} from "@/components/transfer-allocation-info";
import {TransferDetailsModal} from "./transfer-details";
import { FundActivityPanel } from "./fund-activity-panel";
import { accountLabel, fundOptionLabel } from "@/lib/account-label";
import { LoadingSpinner, LoadingIndicator } from "@/components/loading-indicator";
import { useEffect, useRef, useState } from "react";
import { getFundTransactions, bulkAssignTransactions, addTransactionNote } from "@/lib/admin-api";
import type { FundTransactionList } from "@/lib/transaction-management";
import { dateTime, vnd, fundUsesAccount } from "@/lib/domain";
import { useToast } from "@/components/toasts";
type Row=FundTransactionList["rows"][number];
export function FundTransactions({fundId,active,funds,accounts,onNavigate}:{fundId:string;active:boolean;onNavigate?:()=>void;funds:{id:string;code:string;name:string;accountId:string;accountIds:string[];status:string}[];accounts:{id:string;number:string}[]}) {
  const [data,setData]=useState<FundTransactionList>({rows:[],count:0,page:1,fundLedger:null,transfers:[],summary:{total:{count:0,income:"0",expense:"0"},byAccount:[]}}),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [page,setPage]=useState(1),[query,setQuery]=useState(""),[draft,setDraft]=useState(""),[type,setType]=useState(""),[account,setAccount]=useState(""),[reload,setReload]=useState(0);
  const [selected,setSelected]=useState<Map<string,Row>>(new Map()),[target,setTarget]=useState(""),[reason,setReason]=useState("");
  const [editing,setEditing]=useState(""),[note,setNote]=useState("");
  const request=useRef(0),operation=useRef<{signature:string;id:string}|null>(null),noteOperation=useRef<{signature:string;id:string}|null>(null);
  const toast=useToast();
  const [accountReady,setAccountReady]=useState(false);
  const lastReload=useRef(0);
  useEffect(()=>{
    if(!active)return;
    const restore=()=>{const params=new URL(window.location.href).searchParams;const value=params.get("txFund")===fundId?params.get("txAccount")??"":"";setAccount(accounts.some(a=>a.id===value)?value:"");setPage(1);setAccountReady(true)};
    restore();window.addEventListener("popstate",restore);
    return()=>window.removeEventListener("popstate",restore);
  },[active,fundId,accounts]);
  function chooseAccount(value:string){
    if(value===account)return;
    const url=new URL(window.location.href);url.searchParams.set("txFund",fundId);
    if(value)url.searchParams.set("txAccount",value);else url.searchParams.delete("txAccount");
    window.history.pushState(window.history.state,"",url.pathname+url.search);
    setAccount(value);setPage(1);setEditing("");
  }
  useEffect(()=>{
    const current=++request.current;
    let cancelled=false;
    if(!active||!accountReady)return;
    async function load(){
      setLoading(true);setError("");
      try{
        const force=reload!==lastReload.current;lastReload.current=reload;
        const result=await getFundTransactions({fundId,page,q:query,type,account},force);
        if(cancelled||current!==request.current)return;
        if(result.error||!result.data)throw new Error(result.error??"Không tải được giao dịch");
        setData(result.data);
      }catch(cause){if(!cancelled&&current===request.current){const message=cause instanceof Error?cause.message:"Không tải được giao dịch";setError(message);toast(message,"error")}}
      finally{if(!cancelled&&current===request.current)setLoading(false)}
    }
    void load();
    return()=>{cancelled=true};
  },[fundId,active,accountReady,page,query,type,account,reload,toast]);
  useEffect(()=>{
    if(!active)return;
    const refresh=()=>{setSelected(new Map());setReload(n=>n+1)};
    window.addEventListener("admin:data-changed",refresh);
    return()=>window.removeEventListener("admin:data-changed",refresh);
  },[active]);
  const rows=[...selected.values()],income=rows.reduce((n,r)=>n+(r.direction==="CREDIT"?BigInt(r.amount):0n),0n),expense=rows.reduce((n,r)=>n+(r.direction==="DEBIT"?BigInt(r.amount):0n),0n);
  const selectable=data.rows.filter(r=>!r.opening&&BigInt(r.amount)>0n);
  const allOnPage=selectable.length>0&&selectable.every(r=>selected.has(r.id));
  function toggle(row:Row){if(BigInt(row.amount)<=0n)return;if(!selected.has(row.id)&&selected.size>=500){toast("Mỗi lần chọn tối đa 500 giao dịch.","error");return}setSelected(previous=>{const next=new Map(previous);if(next.has(row.id))next.delete(row.id);else if(next.size<500)next.set(row.id,row);return next})}
  async function assign(){
    if(!rows.length||!target||reason.trim().length<5){toast("Chọn giao dịch, thiện pháp nhận và nhập lý do ít nhất 5 ký tự.","error");return}
    const warning=fundAssignmentWarning(funds.find(f=>f.id===target));
    if(warning&&!window.confirm(`${warning} Tiếp tục gán?`))return;
    setBusy(true);setError("");
    const payload={sourceFundId:fundId,targetFundId:target,reason:reason.trim(),rows:rows.map(r=>({id:r.id,updatedAt:r.updatedAt}))};
    const signature=JSON.stringify(payload);
    if(operation.current?.signature!==signature)operation.current={signature,id:crypto.randomUUID()};
    try{
      const result=await bulkAssignTransactions({...payload,requestId:operation.current.id});
      if(result.error)throw new Error(result.error);
      toast(result.success??"Đã gán giao dịch");operation.current=null;setSelected(new Map());setReason("");setReload(n=>n+1);
    }catch(cause){const message=cause instanceof Error?cause.message:"Kết nối gián đoạn. Có thể thử lại an toàn.";setError(message);toast(message,"error")}
    finally{setBusy(false)}
  }
  async function saveNote(row:Row){
    if(note.trim().length<3){toast("Ghi chú cần ít nhất 3 ký tự.","error");return}
    setBusy(true);
    const signature=JSON.stringify([row.id,note.trim()]);
    if(noteOperation.current?.signature!==signature)noteOperation.current={signature,id:crypto.randomUUID()};
    try{
      const result=await addTransactionNote({requestId:noteOperation.current.id,transactionId:row.id,text:note.trim()});
      if(result.error)throw new Error(result.error);
      toast(result.success??"Đã lưu ghi chú");noteOperation.current=null;setEditing("");setNote("");
      // A note changes the record version: require a fresh selection before moving it.
      setSelected(previous=>{const next=new Map(previous);next.delete(row.id);return next});
      setReload(n=>n+1);
    }catch(cause){toast(cause instanceof Error?cause.message:"Không lưu được ghi chú","error")}
    finally{setBusy(false)}
  }
  return <div className="fund-transaction-workspace">
    <FundActivityPanel fundId={fundId} account={account} active={active} onNavigate={onNavigate}/>
    <div className="fund-transaction-account-tabs" role="tablist" aria-label="Giao dịch theo tài khoản">
      {[{id:"",label:"Tổng"},...accounts.map(a=>({id:a.id,label:`TK ${accountLabel(a.number)}`}))].map(tab=>{const total=tab.id?data.summary.byAccount.find(a=>a.accountId===tab.id):data.summary.total,ledger=tab.id?data.fundLedger?.byAccount.find(a=>a.accountId===tab.id):data.fundLedger,balance=ledger?.balance??(BigInt(total?.income??"0")-BigInt(total?.expense??"0")).toString();return <button key={tab.id} type="button" role="tab" aria-selected={account===tab.id} aria-controls="fund-transaction-results" disabled={busy} onClick={()=>chooseAccount(tab.id)}><strong>{tab.label}</strong><span>{total?.count??0} giao dịch</span><span className="fund-tab-amounts"><span className="fund-tab-income"><small>Thu</small><b>{vnd(total?.income??"0")}</b></span><span className="fund-tab-expense"><small>Chi</small><b>{vnd(total?.expense??"0")}</b></span></span><span className={`fund-tab-balance${BigInt(balance)<0n?" negative":""}`}><small>Số dư thiện pháp</small><b>{vnd(balance)}</b></span></button>})}
    </div>
    {data.transfers.length>0&&<section className="fund-transfer-history"><h3>Điều chuyển nội bộ</h3><small>20 khoản gần nhất theo tài khoản đang chọn. Đã tính vào số dư thiện pháp; không phải giao dịch ngân hàng mới.</small><div className="table-scroll table-card"><table><thead><tr><th>Thời gian / người thực hiện</th><th>Từ → đến / ghi chú điều chuyển</th><th className="align-right">Số tiền</th><th>Chi tiết</th></tr></thead><tbody>{data.transfers.map(t=><tr key={t.id}><td>{dateTime(t.at)}<small>{t.actor}</small></td><td><strong>{t.from} → {t.to}{t.reversal?" · Bút toán đảo":""}</strong><p>{t.reason}</p>{BigInt(t.balanceAmount)>0n&&<small>Trong đó số dư chuyển sang / khả dụng: {vnd(t.balanceAmount)}</small>}</td><td className="money align-right nowrap">{t.received?"+":"−"}{vnd(t.amount)}</td><td>{t.count>0&&<TransferDetailsModal id={t.id} count={t.count}/>}</td></tr>)}</tbody></table></div></section>}
    <div className="notice">Chọn các giao dịch để đổi thiện pháp. Lý do chung sẽ xuất hiện công khai ở từng khoản; nội dung gốc, số tiền và tài khoản sao kê được giữ nguyên. Mỗi lần tối đa 500 giao dịch.</div>
    <form className="fund-transaction-filters" onSubmit={event=>{event.preventDefault();setQuery(draft);setPage(1);setReload(n=>n+1)}}>
      <input aria-label="Tìm giao dịch trong thiện pháp" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Nội dung, người chuyển, mã giao dịch hoặc ghi chú…" maxLength={100} disabled={busy}/>
      <select aria-label="Loại giao dịch" value={type} disabled={busy} onChange={e=>{setType(e.target.value);setPage(1)}}><option value="">Thu & chi</option><option value="CREDIT">Hùn phước</option><option value="DEBIT">Khoản chi</option></select>
      <button className="button subtle small" disabled={busy||loading}>Tìm / tải lại</button>
    </form>
    <div className="bulk-selection-summary" aria-live="polite"><strong>Đã chọn {selected.size} giao dịch · Tổng số tiền {vnd(income+expense)}</strong><span>Thu: <b>{vnd(income)}</b> · Chi: <b>{vnd(expense)}</b> · Chênh lệch thu − chi: <b>{vnd(income-expense)}</b></span>{accounts.map(a=>{const own=rows.filter(r=>r.accountId===a.id);return own.length>0&&<small key={a.id}>TK {accountLabel(a.number)}: {own.length} khoản · Thu {vnd(own.filter(r=>r.direction==="CREDIT").reduce((n,r)=>n+BigInt(r.amount),0n))} · Chi {vnd(own.filter(r=>r.direction==="DEBIT").reduce((n,r)=>n+BigInt(r.amount),0n))}</small>})}<button type="button" className="button subtle small" disabled={busy||!selected.size} onClick={()=>setSelected(new Map())}>Bỏ chọn tất cả</button></div>
    <fieldset disabled={busy} className="bulk-assignment-controls action-fields">
      <label>Thiện pháp nhận<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Chọn thiện pháp…</option>{funds.filter(f=>f.id!==fundId&&rows.every(r=>fundUsesAccount(f,r.accountId))).map(f=><option key={f.id} value={f.id}>{fundOptionLabel(f,accounts)}</option>)}</select><small>Chỉ gán vào thiện pháp nhận đúng tài khoản của tất cả giao dịch đã chọn.</small></label>
      {fundAssignmentWarning(funds.find(f=>f.id===target))&&<div className="notice" role="status">{fundAssignmentWarning(funds.find(f=>f.id===target))}</div>}
      <label>Lý do chung, hiển thị công khai<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} rows={2} placeholder="Ví dụ: Nội dung ghi TP112, quản trị viên điều chỉnh về đúng thiện pháp."/></label>
      <button type="button" className="button primary small" disabled={!selected.size||!target||reason.trim().length<5||busy} onClick={assign}>{busy?<><LoadingSpinner size={20}/>Đang lưu…</>:`Gán ${selected.size} giao dịch đã chọn`}</button>
    </fieldset>
    {error&&<div className="notice danger" role="alert">{error}</div>}
    <p className="fund-transaction-count">{loading?<LoadingIndicator compact label="Đang tải giao dịch…"/>:`${data.count.toLocaleString("vi-VN")} giao dịch · Trang ${data.page} · 100 dòng/trang`}</p>
    <div id="fund-transaction-results" role="tabpanel" className="table-scroll table-card fund-transaction-table" aria-busy={loading}>
      <table><thead><tr><th><input type="checkbox" aria-label="Chọn toàn bộ giao dịch trang này" checked={allOnPage} disabled={loading||busy||!selectable.length} onChange={()=>setSelected(previous=>{const next=new Map(previous);for(const row of selectable){if(allOnPage)next.delete(row.id);else if(next.size<500)next.set(row.id,row)}return next})}/></th><th>Thời gian / TK</th><th>Nội dung gốc / ghi chú công khai</th><th className="align-right">Tính cho thiện pháp</th><th>Thao tác</th></tr></thead><tbody>
        {data.rows.map(row=><tr key={row.id} className={selected.has(row.id)?"bulk-selected":BigInt(row.amount)===0n?"allocation-history-row":""}><td><input type="checkbox" aria-label={`Chọn giao dịch ${row.refId||row.id}`} checked={selected.has(row.id)} disabled={busy||loading||row.opening||BigInt(row.amount)===0n} onChange={()=>toggle(row)}/></td><td>{row.dateUnknown?"Chưa có ngày trong Excel":dateTime(row.at)}<small>TK {accountLabel(row.account)} · {row.refId}</small></td><td><p className="sheet-narrative">{row.narrative||"Không có nội dung"}</p>{row.opening&&<span className="sheet-source">Số dư chuyển sang đầu tháng</span>}<small>{row.displayName}</small><TransferAllocationInfo originalAmount={row.originalAmount} amount={row.amount} code={funds.find(f=>f.id===fundId)?.code??"thiện pháp này"} trail={row.transferTrail} details={id=><TransferDetailsModal id={id} count={0} trigger="Chi tiết điều chuyển"/>}/>{row.notes.map(n=><div key={n.id} className="transaction-admin-note"><strong>Ghi chú quản trị:</strong> {n.text}<small>{n.actor} · {dateTime(n.at)}</small></div>)}{editing===row.id&&<div className="inline-note-editor"><label>Ghi chú hiển thị công khai<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={2000} rows={2} disabled={busy}/></label><button type="button" className="button primary small" disabled={busy||note.trim().length<3} onClick={()=>saveNote(row)}>Lưu ghi chú</button><button type="button" className="button subtle small" disabled={busy} onClick={()=>setEditing("")}>Hủy</button></div>}</td><td className="money align-right nowrap">{row.direction==="CREDIT"?"+":"−"}{vnd(row.amount)}</td><td>{BigInt(row.amount)===0n?<span className="badge neutral">Chỉ lưu lịch sử</span>:row.opening?<span className="badge neutral">Số dư chuyển sang</span>:<button type="button" className="button subtle small" disabled={busy} onClick={()=>{setEditing(row.id);setNote("")}}>Thêm ghi chú</button>}</td></tr>)}
        {!loading&&!data.rows.length&&<tr><td colSpan={5}>Không có giao dịch phù hợp.</td></tr>}
      </tbody></table>
    </div>
    <div className="pagination"><span>{selected.size>0?"Các khoản đã chọn được giữ khi đổi trang hoặc bộ lọc.":"Chọn từng dòng hoặc toàn bộ trang để thao tác."}</span><div><button className="button subtle small" disabled={busy||loading||page<=1} onClick={()=>setPage(n=>n-1)}>← Trước</button><button className="button subtle small" disabled={busy||loading||page*100>=data.count} onClick={()=>setPage(n=>n+1)}>Sau →</button></div></div>
  </div>;
}
