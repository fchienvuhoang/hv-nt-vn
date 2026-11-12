"use client";
import {useEffect,useState} from "react";
import {Brand} from "@/components/ui";
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
 return <div className="public-site"><header className="public-header"><Brand href={`/t/${slug}`}/></header><main className="public-detail public-compact">
   <a className="button subtle" href={`/t/${slug}`}>Về sao kê thiện pháp</a>
   <h1>Danh sách phương danh{data?` · ${data.fund.title}`:""}</h1>
   {error?<div role="alert" className="notice danger">{error} <button className="button subtle" onClick={()=>{setState({page:0});setRetry(n=>n+1)}}>Thử lại</button></div>:!data?<LoadingIndicator label="Đang tải phương danh…"/>:<>
     <h2>{data.fund.code} · {data.fund.name}</h2>
     <p>Một {data.fund.title}: {vnd(data.fund.amount)}. Danh sách gồm {data.count} giao dịch hùn phước từ mức này trở lên, xét riêng từng giao dịch và không cộng dồn.</p>
     <div className="table-scroll table-card"><table><thead><tr><th>#</th><th>Phương danh</th><th>Thời gian</th><th>Số tiền hùn phước</th><th>Nội dung đối chiếu</th></tr></thead><tbody>
       {data.rows.map((row,index)=><tr key={index}><td>{(data.page-1)*data.pageSize+index+1}</td><td>{row.name||"Đang bổ sung phương danh"}</td><td>{dateTime(row.at)}</td><td className="money">{vnd(row.amount)}</td><td>{row.narrative}</td></tr>)}
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
