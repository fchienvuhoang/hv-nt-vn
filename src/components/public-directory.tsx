"use client";
import { LoadingIndicator } from "@/components/loading-indicator";

import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import {Search,ArrowUpRight,Sprout} from "lucide-react";
import {Brand,Empty,Pagination} from "@/components/ui";
import {PublicLink as Link} from "@/components/public-link";
import {dateTime,vnd} from "@/lib/domain";
import type {PublicDirectoryDTO} from "@/lib/public-data";
export function PublicDirectory({initial}:{initial:PublicDirectoryDTO}){
 const params=useSearchParams(),q=(params.get("q")??"").trim().slice(0,100),page=Math.max(1,Math.floor(Number(params.get("page"))||1)),key=JSON.stringify([q,page]);
 const [state,setState]=useState({key:JSON.stringify([initial.search,initial.page]),data:initial,error:"",loading:false}),[retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let alive=true;
  async function load(){setState(s=>({...s,key,loading:true,error:""}));try{const response=await fetch(`/api/public/funds?${new URLSearchParams({q,page:String(page)})}`,{cache:"no-store",signal:controller.signal}),data=await response.json();if(!response.ok)throw new Error(data.error??"Không tải được thiện pháp");if(alive)setState({key,data,error:"",loading:false})}catch(error){if(alive)setState(s=>({...s,key,loading:false,error:error instanceof Error?error.message:"Không tải được thiện pháp"}))}}
  if(key!==JSON.stringify([initial.search,initial.page])||retry)void load();else setState({key,data:initial,error:"",loading:false});
  return()=>{alive=false;controller.abort()};
 },[key,q,page,initial,retry]);
 const {data,error}=state,loading=state.loading||state.key!==key;
 return <div className="public-site"><header className="public-header"><Brand href="/minh-bach"/><span className="public-directory-header-note">“Lấy thí thắng xan tham.” — Kinh Pháp Cú, kệ 223 (HT. Thích Minh Châu dịch)</span></header>
 <main className="public-detail public-compact public-directory">
  <div className="directory-intro"><span className="eyebrow">HỌC VIỆN NGUYÊN THỦY VIỆT NAM</span><h1>Minh bạch thiện pháp</h1><p>Tra cứu khoản hùn phước và cùng theo dõi hành trình trao gửi.</p></div>
  <form className="directory-search" role="search" action="/minh-bach" method="get" key={q} onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);window.history.pushState(null,"",`/minh-bach?${new URLSearchParams({q:String(form.get("q")??"").trim()})}`)}}>
   <label htmlFor="directory-search">Tìm thiện pháp hoặc nội dung giao dịch</label><div><Search size={18}/><input id="directory-search" name="q" type="search" defaultValue={q} maxLength={100} placeholder="Mã thiện pháp, nội dung, tên thí chủ, số tiền hoặc 3 số cuối điện thoại…"/><button className="button primary" type="submit">Tìm kiếm</button>{q&&<Link href="/minh-bach" className="button subtle">Xóa</Link>}</div>
   <small>Chỉ tra cứu các thiện pháp đang hoạt động được ban quản trị cho phép hiển thị. Số điện thoại được che, chỉ giữ 3 số cuối.</small>
  </form>
  {error?<div role="alert" className="notice danger">{error} <button className="button subtle small" onClick={()=>setRetry(n=>n+1)}>Thử lại</button></div>:loading?<LoadingIndicator label="Đang tìm thiện pháp và giao dịch…"/>:<>
   <div className="directory-result-label"><strong>{data.count} thiện pháp{q?` khớp “${q}”`:" đang hoạt động"}</strong>{q&&<span>{data.transactionCount.toLocaleString("vi-VN")} giao dịch phù hợp</span>}</div>
   {!data.funds.length?<Empty title="Không tìm thấy kết quả">Thử nội dung khác hoặc ba số cuối điện thoại. Giao dịch chưa phân loại chưa xuất hiện tại thiện pháp.</Empty>:<div className="public-fund-grid">{data.funds.map(f=>{
    const detail=`/t/${f.slug}`,resultLink=q&&f.previews.length?`${detail}?${new URLSearchParams({type:f.previews[0].direction,q})}`:detail;
    return <article className="public-fund-card" key={f.slug}><div className="public-fund-card-top"><span className="code">{f.code}</span><span className="public-active-label"><Sprout size={12}/>Đang hoạt động</span></div><h2><Link href={detail}>{f.name}</Link></h2>
     <dl className="directory-fund-totals"><div><dt>Hùn phước</dt><dd>{vnd(f.income)}</dd></div><div><dt>Đã chi</dt><dd>{vnd(f.expense)}</dd></div><div><dt>Số dư</dt><dd>{vnd(f.balance)}</dd></div></dl>
     {f.previews.length>0&&<div className="directory-matches"><strong>{f.matches} giao dịch phù hợp</strong>{f.previews.map((r,i)=><Link className="directory-match" key={i} href={`${detail}?${new URLSearchParams({type:r.direction,q})}`}><span>{dateTime(r.at)} · TK {r.account}<b className={r.direction==="CREDIT"?"positive":"negative"}>{r.direction==="CREDIT"?"+":"−"}{vnd(r.amount)}</b></span><p>{r.narrative||"Không có nội dung chuyển khoản"}</p>{r.name&&<small>{r.name}</small>}{r.notes.map((n,i)=><small key={i} className="directory-note">Ghi chú: {n.text}</small>)}</Link>)}{f.matches>f.previews.length&&<small>Còn {f.matches-f.previews.length} khoản phù hợp; mở chi tiết để xem thêm.</small>}</div>}
     <Link className="button primary directory-detail-link" href={resultLink}>Xem thiện pháp <ArrowUpRight size={15}/></Link>
    </article>
   })}</div>}
   <Pagination itemLabel="thiện pháp" page={data.page} total={data.count} pageSize={data.pageSize} base={`/minh-bach?${new URLSearchParams({q})}`}/>
  </>}
 </main><footer className="public-footer"><Brand href="/minh-bach"/><span>“Lấy thí thắng xan tham.” — Kinh Pháp Cú, kệ 223 (HT. Thích Minh Châu dịch)</span></footer></div>;
}
