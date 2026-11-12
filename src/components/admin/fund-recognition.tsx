"use client";
import {useState} from "react";
import {Modal} from "@/components/modal";
import {adminRequest,refreshAdminData,useAdminResource} from "@/lib/admin-api";
import {useToast} from "@/components/toasts";
import {LoadingIndicator} from "@/components/loading-indicator";
import {dateTime,vnd} from "@/lib/domain";
import {SITE_ORIGIN} from "@/lib/site-url";
import type {RecognitionData} from "@/lib/fund-recognition";
function NameEditor({fundId,row}:{fundId:string;row:RecognitionData["rows"][number]}){
 const [name,setName]=useState(row.nameOverride),[saving,setSaving]=useState(false);const toast=useToast();
 return <form onSubmit={async event=>{
   event.preventDefault();if(saving)return;setSaving(true);
   try{const result=await adminRequest<{error?:string;success?:string}>("recognition-name",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fundId,transactionId:row.id,name})});
     if(result.error)throw Error(result.error);toast(result.success??"Đã lưu tên phương danh");refreshAdminData();
   }catch(error){toast(error instanceof Error?error.message:"Không lưu được tên","error");}finally{setSaving(false);}
 }} className="inline-actions">
   <input aria-label="Tên ghi phương danh bổ sung" value={name} maxLength={200} placeholder={row.name||"Nhập tên làm bảng tên"} onChange={event=>setName(event.target.value)} disabled={saving}/>
   <button className="button subtle small" disabled={saving||name===row.nameOverride}>{saving?"Đang lưu…":"Lưu tên"}</button>
 </form>;
}
export function FundRecognition({fundId,slug,title}:{fundId:string;slug:string;title:string}){
 const [open,setOpen]=useState(false),[page,setPage]=useState(1);
 const {data,error,loading}=useAdminResource<RecognitionData>(`recognition?${new URLSearchParams({fundId,page:String(page)})}`,15000,open);
 const toast=useToast(),url=new URL(`/t/${slug}/phuong-danh`,SITE_ORIGIN).href;
 return <Modal wide title={`Phương danh · ${title}`} trigger="Danh sách phương danh" triggerClassName="button subtle small" onOpen={()=>setOpen(true)} onDismiss={()=>setOpen(false)} footerNote="Mỗi dòng là một giao dịch đạt mức cổ phần. Tên bổ sung hiển thị công khai và không thay đổi sao kê gốc. Để trống để dùng lại tên trên sao kê.">
   <div className="inline-actions"><a className="button subtle" href={url} target="_blank" rel="noreferrer">Mở trang công khai</a><button className="button subtle" onClick={async()=>{try{await navigator.clipboard.writeText(url);toast("Đã sao chép link phương danh");}catch{toast("Không sao chép được link","error");}}}>Sao chép link</button></div>
   {error?<p role="alert">{error}</p>:loading&&!data?<LoadingIndicator label="Đang tải danh sách phương danh…"/>:data&&<>
     <p>{data.count} giao dịch đạt mức {vnd(data.fund.amount)} trở lên · {data.fund.title}</p>
     <div className="table-scroll"><table><thead><tr><th>#</th><th>Giao dịch</th><th>Số tiền</th><th>Tên phương danh</th><th>Bổ sung / sửa tên công khai</th></tr></thead><tbody>
       {data.rows.map((row,index)=><tr key={row.id}><td>{(data.page-1)*data.pageSize+index+1}</td><td>{dateTime(row.at)}<small>{row.narrative}</small></td><td>{vnd(row.amount)}</td><td>{row.name||"Chưa có tên"}</td><td><NameEditor key={`${row.id}:${row.nameOverride}`} fundId={fundId} row={row}/></td></tr>)}
     </tbody></table></div>
     {!data.rows.length&&<p>Chưa có giao dịch đạt mức cổ phần.</p>}
     <div className="inline-actions"><button className="button subtle" disabled={data.page<=1} onClick={()=>setPage(data.page-1)}>Trang trước</button><span>Trang {data.page} / {Math.max(1,Math.ceil(data.count/data.pageSize))}</span><button className="button subtle" disabled={data.page*data.pageSize>=data.count} onClick={()=>setPage(data.page+1)}>Trang sau</button></div>
   </>}
 </Modal>;
}
