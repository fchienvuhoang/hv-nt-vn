"use client";
import { useEffect,useRef,useState } from "react";
import { useSearchParams } from "next/navigation";
import { PublicLink as Link } from "@/components/public-link";
import { ShieldCheck,Clock,Search } from "lucide-react";
import { Brand,Status,Metric,Section,Empty,Pagination } from "@/components/ui";
import { dateTime,vnd } from "@/lib/domain";
import { publicQuery } from "@/lib/public-query";
import type { PublicFundDTO } from "@/lib/public-data";
const PUBLIC_PAGE_SIZE=100;
export function PublicFundLedger({slug,initial,initialKey}:{slug:string;initial:PublicFundDTO;initialKey:string}) {
  const params=useSearchParams(),query=publicQuery({page:params.get("page"),type:params.get("type"),q:params.get("q")});
  const {direction,search}=query,key=JSON.stringify(query),base=`/t/${slug}`;
  const [initialAt]=useState(()=>Date.now());
  const cached=useRef(new Map([[initialKey,{fund:initial,at:initialAt}]]));
  const [state,setState]=useState({key:initialKey,fund:initial,loading:false,error:""}),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let alive=true;
    const controller=new AbortController();
    async function load(){
      const existing=cached.current.get(key);
      if(existing&&Date.now()-existing.at<30000&&!retry){setState({key,fund:existing.fund,loading:false,error:""});return;}
      setState({key,fund:existing?.fund??initial,loading:true,error:""});
      try{
        const response=await fetch(`/api/public/funds/${slug}?${new URLSearchParams({type:direction,q:search,page:String(query.page)})}`,{cache:"no-store",signal:controller.signal});
        const data=await response.json();if(!response.ok)throw new Error(data.error??"Không tải được giao dịch");
        if(!alive)return;
        cached.current.set(key,{fund:data,at:Date.now()});if(cached.current.size>20)cached.current.delete(cached.current.keys().next().value!);
        setState({key,fund:data,loading:false,error:""});
      }catch(cause){if(alive)setState({key,fund:existing?.fund??initial,loading:false,error:cause instanceof Error?cause.message:"Không tải được giao dịch"})}
    }
    void load();return()=>{alive=false;controller.abort()};
  },[key,slug,direction,search,query.page,initial,retry]);
  const fund=state.key===key?state.fund:initial,loading=state.key!==key||state.loading,error=state.key===key?state.error:"";
  return (
    <div className="public-site">
      <header className="public-header">
        <Brand href="/minh-bach" />
        <Link href="/minh-bach" className="button subtle small">Về trang Minh bạch</Link>
      </header>
      <main className="public-detail public-compact">
        <div className="fund-intro">
          <div className="eyebrow">HÀNH TRÌNH THIỆN LÀNH · {fund.code}</div>
          <h1>{fund.name}</h1>
          <div className="intro-meta">
            <Status status={fund.status} />
            <span>Tài khoản {fund.account}</span>
          </div>
          {fund.description && <p>{fund.description}</p>}
          <div className="public-update">
            <Clock size={14} />
            {fund.syncAt
              ? `Đã đồng bộ đầy đủ đến lượt ${dateTime(fund.syncAt)}`
              : "Đang chờ hoàn tất đồng bộ đầu tiên"}
            <span>·</span> Bản hiển thị: {dateTime(fund.generatedAt)}
          </div>
        </div>
        {fund.pendingImports > 0 && (
          <div className="notice">
            Đang nhập lịch sử Excel; số liệu có thể chưa đầy đủ cho tới khi nhập
            xong.
          </div>
        )}
        <div className="metrics">
          <Metric
            label="Tổng hùn phước"
            value={fund.income}
            note="Các khoản hùn phước đã ghi nhận"
            accent
          />
          <Metric
            label="Tổng chi"
            value={fund.expense}
            note="Các khoản chi thực tế của thiện pháp"
          />
          <Metric
            label="Số dư thiện pháp"
            value={fund.balance}
            note="Đã tính cả điều chuyển nội bộ"
          />
        </div>
        <div className="public-transfers-summary">
          <span>
            Điều chuyển vào: <strong>{vnd(fund.transferIn)}</strong>
          </span>
          <span>
            Điều chuyển ra: <strong>{vnd(fund.transferOut)}</strong>
          </span>
          <span>
            Điều chuyển ròng lịch sử:{" "}
            <strong>{vnd(fund.openingTransferNet)}</strong>
          </span>
        </div>
        <div className="public-ledger-card">
        <Section
          title="Danh sách hùn phước & khoản chi"
          note="Số điện thoại được che, giữ 3 số cuối để đối chiếu."
        >
          <div className="public-ledger-tools">
          <div className="tabs">
            <Link
              className={direction === "CREDIT" ? "selected" : ""}
              href={`${base}?${new URLSearchParams({type:"CREDIT",...(search?{q:search}:{})})}`}
            >
              Khoản hùn phước
            </Link>
            <Link
              className={direction === "DEBIT" ? "selected" : ""}
              href={`${base}?${new URLSearchParams({type:"DEBIT",...(search?{q:search}:{})})}`}
            >
              Khoản chi
            </Link>
          </div>
          <form action={base} method="get" key={key} onSubmit={event=>{event.preventDefault();const params=new URLSearchParams();for(const [name,value] of new FormData(event.currentTarget))if(typeof value==="string"&&value)params.set(name,value);window.history.pushState(null,"",`${base}?${params}`)}} className="public-search" role="search">
            <input type="hidden" name="type" value={direction} />
            <label htmlFor="public-transaction-search">Tìm khoản hùn phước / khoản chi</label>
            <div className="public-search-controls">
              <input id="public-transaction-search" type="search" name="q" defaultValue={search} maxLength={100} placeholder="Nội dung, tên thí chủ, số tiền hoặc 3 số cuối điện thoại…" />
              <button className="button primary" type="submit"><Search size={15} />Tìm kiếm</button>
              {search&&<Link className="button subtle" href={`${base}?type=${direction}`}>Xóa tìm kiếm</Link>}
            </div>
            <small>{fund.count.toLocaleString("vi-VN")} giao dịch{search?` khớp “${search}”`:""} · 100 dòng/trang</small>
          </form>
          </div>
          {(BigInt(fund.openingIncome) !== 0n ||
            BigInt(fund.openingExpense) !== 0n) && (
            <div className="notice historical-note">
              Tổng lịch sử cũ đã được tính: hùn phước {vnd(fund.openingIncome)},
              chi {vnd(fund.openingExpense)}. Các khoản này chưa có chi tiết
              được nhập từ Excel.
            </div>
          )}
          {loading?<p role="status" className="public-data-status">Đang tải dữ liệu giao dịch…</p>:error?<div className="notice danger" role="alert">{error}<button className="button subtle" onClick={()=>setRetry(n=>n+1)}>Thử lại</button></div>:!fund.rows.length ? (
            <Empty
              title={
                search ? "Không tìm thấy giao dịch phù hợp" : direction === "CREDIT"
                  ? "Chưa có khoản hùn phước mới"
                  : "Chưa có khoản chi mới"
              }
            >
              {search?"Hãy thử tên, nội dung hoặc 3 số cuối điện thoại. Các tổng thu chi phía trên luôn là tổng toàn thiện pháp.":"Số liệu lịch sử đã được tính trong các tổng ở trên."}
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
                      <td className="nowrap">{dateTime(r.at)}<small>TK {r.account}</small></td>
                      <td>
                        <p className="narrative">
                          {r.narrative || "Không có nội dung chuyển khoản"}
                        </p>
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
            base={`${base}?${new URLSearchParams({type:direction,...(search?{q:search}:{})})}`}
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
        <Brand href="/minh-bach" />
        <span>“Lấy thí thắng xan tham.” — Kinh Pháp Cú, kệ 223 (HT. Thích Minh Châu dịch)</span>
      </footer>
    </div>
  );
}
