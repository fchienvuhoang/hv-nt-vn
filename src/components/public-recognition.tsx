"use client";
import styles from "./public-recognition.module.css";
import {useEffect,useState} from "react";
import {PublicDevotionalBanner} from "@/components/public-devotional-banner";
import {LoadingIndicator} from "@/components/loading-indicator";
import {PublicLink,usePublicSearch,publicNavigate} from "@/components/public-link";
import {dateTime,vnd} from "@/lib/domain";
import type {RecognitionData} from "@/lib/fund-recognition";
type PublicData=Omit<RecognitionData,"rows">&{rows:Omit<RecognitionData["rows"][number],"id"|"nameOverride">[]};
export function PublicRecognition({slug}:{slug:string}){
 const search=usePublicSearch(),page=Math.min(100000,Math.max(1,Math.floor(Number(new URLSearchParams(search).get("page"))||1)));
 const [state,setState]=useState<{page:number;data?:PublicData;error?:string}>({page:0}),[retry,setRetry]=useState(0);
 useEffect(()=>{
   const actualPage=Math.min(100000,Math.max(1,Math.floor(Number(new URLSearchParams(window.location.search).get("page"))||1)));
   if(actualPage!==page)return;
   const controller=new AbortController();
   fetch(`/api/public/funds/${slug}/recognition?page=${page}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
     const data=await response.json();if(!response.ok)throw Error(data.error??"Không tải được danh sách");
     if(!controller.signal.aborted)setState({page,data});
   }).catch(error=>{if(!controller.signal.aborted)setState({page,error:error.message})});
   return()=>controller.abort();
 },[slug,page,retry]);
 const data=state.page===page?state.data:undefined,error=state.page===page?state.error:undefined;
 return <div className="public-site"><main className="public-detail public-compact">
   <PublicDevotionalBanner><header className={styles.intro}>
     <p className={styles.eyebrow}>Danh sách phương danh{data?` · ${data.fund.title}`:""}</p>
     <h1>{data?.fund.name??"Danh sách phương danh"}</h1>
     {data&&<span className={styles.fundBadge}>{data.fund.code} · {data.fund.title}</span>}
   </header></PublicDevotionalBanner>
   {error?<div role="alert" className="notice danger">{error} <button className="button subtle" onClick={()=>{setState({page:0});setRetry(n=>n+1)}}>Thử lại</button></div>:!data?<LoadingIndicator label="Đang tải phương danh…"/>:<>
     <section className={styles.summary} aria-label="Tổng hợp phương danh">
       <div className={styles.total}><span>Tổng hùn phước trong danh sách</span><strong>{vnd(data.totalAmount)}</strong><small>Tổng tất cả các trang phương danh</small></div>
       <div><span>Giao dịch đủ điều kiện</span><strong>{data.count.toLocaleString("vi-VN")}</strong><small>Xét riêng từng giao dịch</small></div>
       <div><span>Một {data.fund.title}</span><strong>{vnd(data.fund.amount)}</strong><small>Ghi nhận từ mức này trở lên</small></div>
     </section>
     <p className={styles.explanation}>Danh sách dành cho các khoản hùn phước đạt mức cổ phần, không cộng dồn giữa các giao dịch.</p>
     <div className={`table-scroll table-card ${styles.table}`}><table className="public-ledger-table" aria-label="Danh sách phương danh cổ phần"><thead><tr><th className="public-row-number">#</th><th>Thời gian</th><th>Phương danh / nội dung hùn phước</th><th className="align-right">Số tiền hùn phước</th></tr></thead><tbody>
       {data.rows.map((row,index)=><tr key={index}>
         <td className="public-row-number">{(data.page-1)*data.pageSize+index+1}</td>
         <td className="nowrap">{dateTime(row.at)}</td>
         <td className={styles.identity}><p className={styles.name}>{row.name||row.narrative||"Đang bổ sung phương danh"}</p>{row.name&&row.narrative&&row.name!==row.narrative&&<small className={styles.narrative}>{row.narrative}</small>}</td>
         <td className="money align-right nowrap positive">{vnd(row.amount)}</td>
       </tr>)}
     </tbody></table></div>
     {!data.rows.length&&<p>Chưa có giao dịch đạt mức cổ phần.</p>}
     <nav className="inline-actions" aria-label="Phân trang phương danh">
       {data.page>1&&<PublicLink className="button subtle" href={`?page=${data.page-1}`}>Trang trước</PublicLink>}
       <span>Trang {data.page} / {Math.max(1,Math.ceil(data.count/data.pageSize))}</span>
       {data.page*data.pageSize<data.count&&<button className="button subtle" onClick={()=>publicNavigate(`?page=${data.page+1}`)}>Trang sau</button>}
     </nav>
   </>}
 </main></div>;
}
