"use client";
import styles from "./public-recognition.module.css";
import {useEffect,useRef,useState} from "react";
import {LoadingIndicator} from "@/components/loading-indicator";
import {PublicLink,usePublicSearch,publicNavigate} from "@/components/public-link";
import {dateTime,vnd} from "@/lib/domain";
import type {RecognitionData} from "@/lib/fund-recognition";
type PublicData=Omit<RecognitionData,"rows">&{rows:Omit<RecognitionData["rows"][number],"id"|"nameOverride">[]};
export function PublicRecognition({slug}:{slug:string}){
 const search=usePublicSearch(),q=(new URLSearchParams(search).get("q")??"").trim().slice(0,100),page=Math.min(100000,Math.max(1,Math.floor(Number(new URLSearchParams(search).get("page"))||1)));
 const key=JSON.stringify([slug,page,q]);
 const cached=useRef(new Map<string,{data:PublicData;at:number}>());
 const [state,setState]=useState<{key:string;data?:PublicData;error?:string}>({key:""}),[retry,setRetry]=useState(0);
 useEffect(()=>{
   const actualPage=Math.min(100000,Math.max(1,Math.floor(Number(new URLSearchParams(window.location.search).get("page"))||1)));
   if(actualPage!==page||(new URLSearchParams(window.location.search).get("q")??"").trim().slice(0,100)!==q)return;
   const existing=cached.current.get(key);
   if(existing&&Date.now()-existing.at<30000){setState({key,data:existing.data});return;}
   const controller=new AbortController();
   fetch(`/api/public/funds/${slug}/recognition?${new URLSearchParams({page:String(page),q})}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
     const data=await response.json();if(!response.ok)throw Error(data.error??"Không tải được danh sách");
     if(!controller.signal.aborted){cached.current.set(key,{data,at:Date.now()});if(cached.current.size>20)cached.current.delete(cached.current.keys().next().value!);setState({key,data});}
   }).catch(error=>{if(!controller.signal.aborted)setState(previous=>({key,data:previous.data,error:error.message}))});
   return()=>controller.abort();
 },[slug,page,q,key,retry]);
 const data=state.data,error=state.key===key?state.error:undefined,loading=state.key!==key;
 return <div className="public-site"><main className="public-detail public-compact">
   <header className={styles.intro}>
     <p className={styles.eyebrow}>PHƯƠNG DANH THÍ CHỦ</p>
     <h1>{data?.fund.name??"Danh sách phương danh"}</h1>
     {data&&<span className={styles.fundBadge}>{data.fund.code} · {data.fund.title}</span>}
   </header>
   {error?<div role="alert" className="notice danger">{error} <button className="button subtle" onClick={()=>{cached.current.clear();setState({key:""});setRetry(n=>n+1)}}>Thử lại</button></div>:!data?<LoadingIndicator label="Đang tải phương danh…"/>:<>
     <section className={styles.summary} aria-label="Tổng hợp phương danh">
       <div className={styles.total}><span>Tổng hùn phước trong danh sách</span><strong>{vnd(data.totalAmount)}</strong><small>Tổng tất cả các trang phương danh</small></div>
       <div><span>Hùn phước cổ phần</span><strong>{data.totalCount.toLocaleString("vi-VN")}</strong><small>Xét riêng từng khoản hùn phước</small></div>
       <div><span>Một {data.fund.title}</span><strong>{vnd(data.fund.amount)}</strong><small>Ghi nhận từ mức này trở lên</small></div>
     </section>
     <p className={styles.explanation}>Danh sách dành cho các khoản hùn phước đạt mức cổ phần, không cộng dồn giữa các khoản hùn phước.</p>
     <form className={styles.search} key={q} role="search" onSubmit={event=>{event.preventDefault();const value=String(new FormData(event.currentTarget).get("q")??"").trim();publicNavigate(`?${new URLSearchParams(value?{q:value}:{})}`)}}>
       <label htmlFor="recognition-search">Tìm phương danh hoặc nội dung hùn phước</label>
       <div><input id="recognition-search" name="q" type="search" maxLength={100} defaultValue={q} placeholder="Tên thí chủ, nội dung hoặc số tiền…"/><button className="button primary" type="submit">Tìm kiếm</button>{q&&<button className="button subtle" type="button" onClick={()=>publicNavigate("?page=1")}>Xóa tìm kiếm</button>}</div>
       {q&&!loading&&<small>{data.count.toLocaleString("vi-VN")} khoản hùn phước phù hợp với “{q}”</small>}
     </form>
     {loading?<LoadingIndicator label="Đang tìm phương danh…"/>:<div className={`table-scroll table-card ${styles.table}`}><table className="public-ledger-table" aria-label="Danh sách phương danh cổ phần"><thead><tr><th className="public-row-number">#</th><th>Thời gian</th><th>Phương danh / nội dung hùn phước</th><th className="align-right">Số tiền hùn phước</th></tr></thead><tbody>
       {data.rows.map((row,index)=><tr key={index}>
         <td className="public-row-number">{(data.page-1)*data.pageSize+index+1}</td>
         <td className="nowrap">{dateTime(row.at)}</td>
         <td className={styles.identity}><p className={styles.name}>{row.name||row.narrative||"Đang bổ sung phương danh"}</p>{row.name&&row.narrative&&row.name!==row.narrative&&<small className={styles.narrative}>{row.narrative}</small>}</td>
         <td className="money align-right nowrap positive">{vnd(row.amount)}</td>
       </tr>)}
     </tbody></table></div>}
     {!loading&&!data.rows.length&&<p>{q?"Không tìm thấy khoản hùn phước phù hợp.":"Chưa có khoản hùn phước đạt mức cổ phần."}</p>}
     <nav className="inline-actions" aria-label="Phân trang phương danh">
       {!loading&&data.page>1&&<PublicLink className="button subtle" href={`?${new URLSearchParams({page:String(data.page-1),...(q?{q}:{})})}`}>Trang trước</PublicLink>}
       <span>Trang {data.page} / {Math.max(1,Math.ceil(data.count/data.pageSize))}</span>
       {!loading&&data.page*data.pageSize<data.count&&<button className="button subtle" onClick={()=>publicNavigate(`?${new URLSearchParams({page:String(data.page+1),...(q?{q}:{})})}`)}>Trang sau</button>}
     </nav>
   </>}
 </main></div>;
}
