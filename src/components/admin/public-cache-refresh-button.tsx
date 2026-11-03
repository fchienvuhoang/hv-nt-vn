"use client";
import {useState} from "react";
import {adminRequest,refreshAdminData} from "@/lib/admin-api";
import {LoadingSpinner} from "@/components/loading-indicator";
import {useToast} from "@/components/toasts";
export function PublicCacheRefreshButton(){
 const [busy,setBusy]=useState(false),toast=useToast();
 async function refresh(){
  if(busy)return;setBusy(true);
  try{
   const result=await adminRequest<{busy?:boolean;built:number;pending?:number}>("public-cache",{method:"POST"});
   refreshAdminData();
   toast(result.busy||result.pending?"Đã yêu cầu cập nhật. Trang công khai sẽ lấy số liệu mới khi mở hoặc bấm Cập nhật số liệu.":"Đã cập nhật số liệu trang công khai.","success");
  }catch(error){toast(error instanceof Error?error.message:"Chưa làm mới được trang công khai.","error")}
  finally{setBusy(false)}
 }
 return <button type="button" className="button subtle small" disabled={busy} onClick={refresh}>{busy&&<LoadingSpinner size={16}/>} {busy?"Đang làm mới…":"Làm mới trang công khai"}</button>;
}
