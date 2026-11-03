"use client";
import {PublicAdminRefresh} from "@/components/public-admin-refresh";
import {PwaAdminReturn} from "@/components/pwa-admin-return";
import { PublicFundGoal } from "@/components/public-fund-goal";
import { PublicTransferContent } from "@/components/public-transfer-content";
import { accountLabel } from "@/lib/account-label";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading-indicator";

import { useEffect,useRef,useState } from "react";
import { PublicLink as Link, usePublicSearch, publicNavigate } from "@/components/public-link";
import { ShieldCheck,Clock,Search } from "lucide-react";
import { Brand,Status,Metric,Section,Empty,Pagination } from "@/components/ui";
import { dateTime,vnd } from "@/lib/domain";
import { publicQuery } from "@/lib/public-query";
import type { PublicFundDTO } from "@/lib/public-data";
const PUBLIC_PAGE_SIZE=100;
export function PublicFundLedger({slug}:{slug:string}) {
  const params=new URLSearchParams(usePublicSearch()),query=publicQuery({page:params.get("page"),type:params.get("type"),q:params.get("q"),month:params.get("month")});
  const {direction,search,month}=query,key=JSON.stringify(query),base=`/t/${slug}`;
  const cached=useRef(new Map<string,{fund:PublicFundDTO;at:number}>());
  const [state,setState]=useState<{key:string;fund:PublicFundDTO|null;loading:boolean;error:string}>({key:"",fund:null,loading:true,error:""}),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const actual=new URLSearchParams(window.location.search);
    if(JSON.stringify(publicQuery({page:actual.get("page"),type:actual.get("type"),q:actual.get("q"),month:actual.get("month")}))!==key)return;
    let alive=true;
    const controller=new AbortController();
    async function load(){
      const existing=cached.current.get(key);
      if(existing&&Date.now()-existing.at<30000&&!retry){setState({key,fund:existing.fund,loading:false,error:""});return;}
      setState(previous=>({key,fund:existing?.fund??previous.fund,loading:true,error:""}));
      try{
        const response=await fetch(`/api/public/funds/${slug}?${new URLSearchParams({type:direction,q:search,month,page:String(query.page)})}`,{cache:"no-store",signal:controller.signal});
        const data=await response.json();if(!response.ok)throw new Error(data.error??"Không tải được giao dịch");
        if(!alive)return;
        cached.current.set(key,{fund:data,at:Date.now()});if(cached.current.size>20)cached.current.delete(cached.current.keys().next().value!);
        setState({key,fund:data,loading:false,error:""});
      }catch(cause){if(alive)setState(previous=>({key,fund:existing?.fund??previous.fund,loading:false,error:cause instanceof Error?cause.message:"Không tải được giao dịch"}))}
    }
    void load();return()=>{alive=false;controller.abort()};
  },[key,slug,direction,search,query.page,month,retry]);
  useEffect(()=>{
    const refresh=()=>{cached.current.clear();setRetry(n=>n+1)};
    const visible=()=>{if(document.hidden)return;const entry=cached.current.get(key);if(!entry||Date.now()-entry.at>=30000)refresh()};
    const channel=typeof BroadcastChannel!=="undefined"?new BroadcastChannel("hvntvn-ledger"):null;
    if(channel)channel.onmessage=event=>{if(event.data==="changed")refresh()};
    window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);
    return()=>{channel?.close();window.removeEventListener("focus",visible);document.removeEventListener("visibilitychange",visible)};
  },[key]);
  useEffect(()=>{if(state.fund)document.title=`${state.fund.code} · ${state.fund.name} - Học viện nguyên thủy Việt Nam`;},[state.fund]);
  const fund=state.fund,loading=state.key!==key||state.loading,error=state.key===key?state.error:"";
  if(!fund)return <div className="public-site">
    <header className="public-header"><Brand href={base}/><PwaAdminReturn/></header>
    <main className="public-detail public-compact" aria-busy={loading}>
      <div className="fund-intro"><h1>Sao kê thiện pháp</h1></div>
      <div className="metrics">{["Tổng hùn phước","Tổng chi","Số dư khả dụng","Chi vượt quỹ"].map(label=><div className="metric" key={label}><span>{label}</span><strong aria-label="Đang tải">—</strong></div>)}</div>
      <div className="public-ledger-card"><Section title="Danh sách hùn phước & khoản chi" note="Số điện thoại được che, giữ 3 số cuối để đối chiếu.">
        {error?<div className="notice danger" role="alert">{error}<button className="button subtle" onClick={()=>setRetry(n=>n+1)}>Thử lại</button></div>:<LoadingIndicator label="Đang tải số liệu và giao dịch…" className="public-data-status"/>}
      </Section></div>
    </main>
    <footer className="public-footer"><Brand href={base}/></footer>
  </div>;
  return (
    <div className="public-site">
      <header className="public-header">
        <Brand href={`/t/${slug}`} />
        <PwaAdminReturn/>
      </header>
      <main className="public-detail public-compact">
        <div className="fund-intro">
          <h1>{fund.name}</h1>
          <div className="intro-meta">
            <Status status={fund.status} />
            <span>Tài khoản {accountLabel(fund.account)}</span>
          </div>
          <div className="public-update">
            <Clock size={14} />
            {fund.syncAt
              ? `Đã đồng bộ đầy đủ đến lượt ${dateTime(fund.syncAt)}`
              : "Đang chờ hoàn tất đồng bộ đầu tiên"}
            <span>·</span> Bản hiển thị: {dateTime(fund.generatedAt)} <PublicAdminRefresh disabled={loading} onRefresh={()=>{cached.current.clear();setRetry(n=>n+1)}}/>
          </div>
        </div>
        {fund.status === "ACTIVE" && <PublicTransferContent code={fund.code}/>}
        {fund.pendingImports > 0 && (
          <div className="notice">
            <LoadingSpinner size={20}/> Đang nhập lịch sử Excel; số liệu có thể chưa đầy đủ cho tới khi nhập
            xong.
          </div>
        )}
        {fund.isLongTerm&&<div className="public-month-picker">Thống kê tháng {fund.month.slice(5,7)}/{fund.month.slice(0,4)} · Tháng hiện tại</div>}
        <PublicFundGoal goalAmount={fund.goalAmount} income={fund.goalIncome}/>
        {fund.isLongTerm?<div className="metrics public-longterm-metrics">
          <Metric label="Tổng hùn phước" value={fund.goalIncome} note="Đã tính phần chuyển sang và điều chuyển ròng" accent/>
          <Metric label="Đã chi trong tháng" value={fund.expense} note="Chỉ các khoản chi trong tháng"/>
          <Metric label="Số dư cuối tháng" value={fund.balance} note="Đầu kỳ + hùn phước − chi + điều chuyển ròng"/>
        </div>:<div className="metrics">
          <Metric
            label="Tổng hùn phước"
            value={fund.goalIncome}
            note="Đã tính các khoản nhập Excel và điều chuyển ròng giữa thiện pháp"
            accent
          />
          <Metric
            label="Tổng chi"
            value={fund.expense}
            note="Các khoản chi thực tế của thiện pháp"
          />
          <Metric
            label="Số dư khả dụng"
            value={fund.availableBalance}
            note="Phần tiền còn lại, tối thiểu 0₫"
          />
          <Metric label="Chi vượt quỹ" value={fund.excessExpense} note="Phần chi vượt khoản hùn phước đã ghi nhận" />
        </div>}
        {fund.isLongTerm&&<p className="public-carry-note">Dư / thiếu tháng trước chuyển sang: <strong>{vnd(fund.carryBalance)}</strong></p>}
        {!fund.isLongTerm&&BigInt(fund.excessExpense)>0n&&<p className="public-deficit-note">Thiện pháp đã chi vượt quỹ <strong>{vnd(fund.excessExpense)}</strong>. Số dư khả dụng hiển thị 0₫; phần thiếu vẫn được giữ khi đối chiếu sổ.</p>}
        {!fund.isLongTerm&&BigInt(fund.openingBalance)!==0n&&<div className="public-opening-balance"><strong>Khoản chuyển sang từ Excel: {vnd(fund.openingBalance)}</strong><div>{fund.openingBalances.map(a=><span key={accountLabel(a.account)}>TK {accountLabel(a.account)}: <b>{vnd(a.amount)}</b>{a.at?` · Từ ${dateTime(a.at)}`:""}</span>)}</div><small>Đã tính vào tổng hùn phước/đã chi tương ứng; số dư được tính từ thu trừ chi, không cộng thêm khoản này lần nữa.</small></div>}
        <div className="public-ledger-card">
        <Section
          title="Danh sách hùn phước & khoản chi"
          note="Số điện thoại được che, giữ 3 số cuối để đối chiếu."
        >
          <div className="public-ledger-tools">
          <div className="tabs">
            <Link
              className={direction === "CREDIT" ? "selected" : ""}
              href={`${base}?${new URLSearchParams({type:"CREDIT",...(fund.month?{month:fund.month}:{}),...(search?{q:search}:{})})}`}
            >
              Khoản hùn phước
            </Link>
            <Link
              className={direction === "DEBIT" ? "selected" : ""}
              href={`${base}?${new URLSearchParams({type:"DEBIT",...(fund.month?{month:fund.month}:{}),...(search?{q:search}:{})})}`}
            >
              Khoản chi
            </Link>
          </div>
          <form action={base} method="get" key={key} onSubmit={event=>{event.preventDefault();const params=new URLSearchParams();for(const [name,value] of new FormData(event.currentTarget))if(typeof value==="string"&&value)params.set(name,value);publicNavigate(`${base}?${params}`)}} className="public-search" role="search">
            <input type="hidden" name="type" value={direction} />{fund.month&&<input type="hidden" name="month" value={fund.month}/>}
            <label htmlFor="public-transaction-search">Tìm khoản hùn phước / khoản chi</label>
            <div className="public-search-controls">
              <input id="public-transaction-search" type="search" name="q" defaultValue={search} maxLength={100} placeholder="Nội dung, tên thí chủ, số tiền hoặc 3 số cuối điện thoại…" />
              <button className="button primary" type="submit"><Search size={15} />Tìm kiếm</button>
              {search&&<Link className="button subtle" href={`${base}?${new URLSearchParams({type:direction,...(fund.month?{month:fund.month}:{})})}`}>Xóa tìm kiếm</Link>}
            </div>
            <small>{fund.count.toLocaleString("vi-VN")} giao dịch{search?` khớp “${search}”`:""} · 100 dòng/trang</small>
          </form>
          </div>
          {!fund.isLongTerm&&(BigInt(fund.openingIncome) !== 0n ||
            BigInt(fund.openingExpense) !== 0n) && (
            <div className="notice historical-note">
              Tổng lịch sử cũ đã được tính: hùn phước {vnd(fund.openingIncome)},
              chi {vnd(fund.openingExpense)}. Các khoản này chưa có chi tiết
              được nhập từ Excel.
            </div>
          )}
          {loading?<LoadingIndicator label="Đang tải dữ liệu giao dịch…" className="public-data-status"/>:error?<div className="notice danger" role="alert">{error}<button className="button subtle" onClick={()=>setRetry(n=>n+1)}>Thử lại</button></div>:!fund.rows.length ? (
            <Empty
              title={
                search ? "Không tìm thấy giao dịch phù hợp" : direction === "CREDIT"
                  ? "Chưa có khoản hùn phước mới"
                  : "Chưa có khoản chi mới"
              }
            >
              {search?"Hãy thử tên, nội dung hoặc 3 số cuối điện thoại. Các tổng phía trên theo kỳ đang hiển thị.":"Số liệu lịch sử đã được tính trong các tổng ở trên."}
            </Empty>
          ) : (
            <div className="table-scroll table-card">
              <table className="public-ledger-table">
                <thead>
                  <tr>
                    <th className="public-row-number">#</th>
                    <th>Thời gian</th>
                    <th>
                      Nội dung{" "}
                      {direction === "CREDIT" ? "hùn phước" : "khoản chi"}
                    </th>
                    <th className="align-right">Số tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {fund.rows.map((r,index) => (
                    <tr key={r.id}>
                      <td className="public-row-number">{(fund.page-1)*PUBLIC_PAGE_SIZE+index+1}</td>
                      <td className="nowrap">{r.dateUnknown?"Chưa có ngày trong Excel":dateTime(r.at)}<small>TK {accountLabel(r.account)}</small></td>
                      <td>
                        <p className="narrative">
                          {r.narrative || "Không có nội dung chuyển khoản"}
                        </p>
                        {r.opening&&<span className="sheet-source">Số dư chuyển sang đầu tháng · đã tính trong số dư</span>}
                        <small>{r.name}</small>
                        {r.notes.map(note=><div key={note.id} className="transaction-public-note"><strong>Ghi chú quản trị:</strong> {note.text}<small>{dateTime(note.at)}</small></div>)}
                      </td>
                      <td
                        className={`align-right money nowrap ${direction === "CREDIT" ? "positive" : "negative"}`}
                      >
                        {vnd(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={fund.page}
            total={fund.count}
            base={`${base}?${new URLSearchParams({type:direction,...(fund.month?{month:fund.month}:{}),...(search?{q:search}:{})})}`}
            pageSize={PUBLIC_PAGE_SIZE}
          />
        </Section>
        </div>
        <Section
          title="Điều chuyển nội bộ"
          note="50 bút toán gần nhất; bao gồm bút toán đảo, không tính thành hùn phước hoặc chi mới."
        >
          {!fund.transfers.length ? (
            <p className="muted padded">
              Chưa có điều chuyển kể từ ngày chuyển đổi.
            </p>
          ) : (
            <div className="table-scroll table-card">
              <table>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Từ → đến</th>
                    <th>Lý do</th>
                    <th className="align-right">Số tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {fund.transfers.map((t) => (
                    <tr key={t.id}>
                      <td className="nowrap">{dateTime(t.at)}</td>
                      <td className="code nowrap">
                        {t.from} → {t.to}
                        {t.reversal && <small>Bút toán đảo</small>}
                      </td>
                      <td>{t.reason}</td>
                      <td className="align-right money nowrap">
                        {vnd(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        <div className="public-assurance">
          <ShieldCheck size={20} />
          <p>
            Số liệu được cập nhật từ sao kê và đối soát của ban quản trị. Điều
            chuyển là phân bổ giữa các thiện pháp trong cùng tài khoản.
          </p>
        </div>
      </main>
      <footer className="public-footer">
        <Brand href={`/t/${slug}`} />
        <span>“Lấy thí thắng xan tham.” — Kinh Pháp Cú, kệ 223 (HT. Thích Minh Châu dịch)</span>
      </footer>
    </div>
  );
}
