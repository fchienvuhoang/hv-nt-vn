"use client";
import {useEffect,useState} from "react";
import {Bell} from "lucide-react";
import {Modal} from "@/components/modal";
import {LoadingIndicator} from "@/components/loading-indicator";
import {pushKinds,pushLabels,defaultPushPreferences} from "@/lib/push-policy";
import {refreshAdminData} from "@/lib/admin-api";
import {adminNavigate} from "./admin-link";
type Preferences=typeof defaultPushPreferences;
type Settings={preferences:Preferences;publicKey:string|null;devices:string[]};
async function api(method="GET",body?:unknown){
  const response=await fetch("/api/admin/push",{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw new Error(data.error||"Không tải được cài đặt thông báo.");return data;
}
async function fingerprint(endpoint:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(endpoint))),b=>b.toString(16).padStart(2,"0")).join("");}
function applicationKey(value:string){return Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));}
export function PushSettings(){
  const [settings,setSettings]=useState<Settings|null>(null),[preferences,setPreferences]=useState(defaultPushPreferences),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(""),[enabled,setEnabled]=useState(false),[supported,setSupported]=useState(false);
  useEffect(()=>{
    const navigate=(event:MessageEvent)=>{if(event.data?.type==="ADMIN_PUSH_NAVIGATE"){const target=new URL(event.data.url,window.location.origin);if(target.origin===window.location.origin&&target.pathname==="/admin"){adminNavigate(target.pathname+target.search);refreshAdminData();}}};
    navigator.serviceWorker?.addEventListener("message",navigate);
    return()=>navigator.serviceWorker?.removeEventListener("message",navigate);
  },[]);
  async function load(){
    setBusy(true);setError("");setMessage("");
    try{
      const data:Settings=await api();setSettings(data);setPreferences(data.preferences);
      const supported="serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;setSupported(supported);
      if(supported){const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"});const sub=await registration.pushManager.getSubscription();setEnabled(Notification.permission==="granted"&&!!sub&&data.devices.includes(await fingerprint(sub.endpoint)));}
    }catch(e){setError(e instanceof Error?e.message:"Không tải được cài đặt.");}finally{setBusy(false);}
  }
  async function run(task:()=>Promise<void>){setBusy(true);setError("");setMessage("");try{await task();}catch(e){setError(e instanceof Error?e.message:"Không thực hiện được thao tác.");}finally{setBusy(false);}}
  async function enable(){
    // Permission request is directly in the click gesture, before network requests (iOS).
    const permission=await Notification.requestPermission();
    if(permission!=="granted")throw new Error("Chưa được cấp quyền. Hãy cho phép thông báo trong cài đặt trình duyệt/thiết bị.");
    await api("PUT",preferences);
    const registration=await navigator.serviceWorker.ready;
    const sub=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(settings!.publicKey!)});
    await api("POST",{action:"subscribe",subscription:sub.toJSON()});setEnabled(true);setMessage("Đã bật thông báo trên thiết bị này.");
  }
  return <Modal title="Thông báo quản trị" trigger={<><Bell size={16}/><span>Thông báo</span></>} triggerClassName="button subtle small" onOpen={()=>void load()} footerNote="Lựa chọn áp dụng cho tài khoản quản trị của bạn; bật nhận riêng trên từng thiết bị.">
    {!settings&&busy?<LoadingIndicator label="Đang tải cài đặt…"/>:<>
      <p>Chọn các thông báo bạn muốn nhận:</p>
      <div className="push-options">{pushKinds.map(kind=><label key={kind}><input type="checkbox" checked={preferences[kind]} disabled={busy||!settings} onChange={e=>setPreferences({...preferences,[kind]:e.target.checked})}/><span>{pushLabels[kind]}{kind==="needsClassification"&&<small>Chưa xác định được thiện pháp; không gồm nhóm sai tài khoản.</small>}{kind==="syncError"&&<small>Lỗi lặp lại được gộp, tối đa một thông báo mỗi 30 phút.</small>}</span></label>)}</div>
      <p className="muted">Chỉ thông báo các sự kiện mới sau khi bật. Nội dung chuyển khoản và số tiền không xuất hiện trong thông báo.</p>
      {settings&&!settings.publicKey&&<p className="notice">Máy chủ chưa sẵn sàng gửi thông báo.</p>}
      {!supported&&<p className="notice">Trên iPhone/iPad (iOS 16.4+), hãy thêm ứng dụng vào Màn hình chính rồi mở từ biểu tượng. Nếu vẫn không hỗ trợ, hãy dùng trình duyệt mới hơn.</p>}
      <div className="push-actions">
        <button className="button primary" disabled={busy||!settings} onClick={()=>void run(async()=>{await api("PUT",preferences);setMessage("Đã lưu các loại thông báo.");})}>Lưu lựa chọn</button>
        {enabled?<>
          <button className="button subtle" disabled={busy} onClick={()=>void run(async()=>{const sub=await (await navigator.serviceWorker.ready).pushManager.getSubscription();if(sub){await api("DELETE",{endpoint:sub.endpoint});await sub.unsubscribe();}setEnabled(false);setMessage("Đã tắt thông báo trên thiết bị này.");})}>Tắt trên thiết bị này</button>
          <button className="button subtle" disabled={busy} onClick={()=>void run(async()=>{const sub=await (await navigator.serviceWorker.ready).pushManager.getSubscription();if(!sub)throw new Error("Cần bật lại thông báo trên thiết bị này.");await api("POST",{action:"test",endpoint:sub.endpoint});setMessage("Đã gửi thông báo thử tới thiết bị này.");})}>Gửi thử</button>
        </>:<button className="button subtle" disabled={busy||!supported||!settings?.publicKey||!Object.values(preferences).some(Boolean)} onClick={()=>void run(enable)}>Bật trên thiết bị này</button>}
      </div>
    </>}
    {error&&<p className="notice danger" role="alert">{error} <button className="button subtle small" disabled={busy} onClick={()=>void load()}>Tải lại</button></p>}
    {message&&<p role="status" className="notice">{message}</p>}
  </Modal>;
}
