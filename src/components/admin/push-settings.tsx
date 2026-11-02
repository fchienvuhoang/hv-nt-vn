"use client";
import {useEffect,useState,useCallback,useSyncExternalStore} from "react";
import {createPortal} from "react-dom";
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
const noopSubscribe=()=>()=>{};
export function PushSettings(){
  const cardTarget=useSyncExternalStore(noopSubscribe,()=>document.getElementById("admin-push-card"),()=>null);
  const standalone=useSyncExternalStore(noopSubscribe,()=>window.matchMedia("(display-mode: standalone)").matches||(navigator as Navigator&{standalone?:boolean}).standalone===true,()=>false);
  const [settings,setSettings]=useState<Settings|null>(null),[preferences,setPreferences]=useState(defaultPushPreferences),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(""),[enabled,setEnabled]=useState(false),[supported,setSupported]=useState(false),[open,setOpen]=useState(false);
  useEffect(()=>{
    const navigate=(event:MessageEvent)=>{if(event.data?.type==="ADMIN_PUSH_NAVIGATE"){const target=new URL(event.data.url,window.location.origin);if(target.origin===window.location.origin&&target.pathname==="/admin"){adminNavigate(target.pathname+target.search);refreshAdminData();}}};
    navigator.serviceWorker?.addEventListener("message",navigate);
    return()=>navigator.serviceWorker?.removeEventListener("message",navigate);
  },[]);
  const load=useCallback(async()=>{
    setBusy(true);setError("");setMessage("");
    try{
      const data:Settings=await api();setSettings(data);setPreferences(data.preferences);
      const supported="serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;setSupported(supported);
      if(supported){const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"});const sub=await registration.pushManager.getSubscription();const active=Notification.permission==="granted"&&!!sub&&data.devices.includes(await fingerprint(sub.endpoint));setEnabled(active);return active;}
    }catch(e){setError(e instanceof Error?e.message:"Không tải được cài đặt.");}finally{setBusy(false);}
    return false;
  },[]);
  useEffect(()=>{
    if(!standalone)return;
    let alive=true;
    const timer=setTimeout(async()=>{try{const active=await load();if(alive&&!active&&("Notification" in window)&&Notification.permission!=="denied"&&("PushManager" in window)&&Number(localStorage.getItem("hvntvn-push-later")??0)<Date.now()&&!document.querySelector("dialog[open]"))setOpen(true);}catch{}},3500);
    return()=>{alive=false;clearTimeout(timer);};
  },[load,standalone]);
  function dismiss(){setOpen(false);try{localStorage.setItem("hvntvn-push-later",String(Date.now()+7*86400000));}catch{}}
  async function run(task:()=>Promise<void>){setBusy(true);setError("");setMessage("");try{await task();}catch(e){setError(e instanceof Error?e.message:"Không thực hiện được thao tác.");}finally{setBusy(false);}}
  async function enable(){
    // Permission request is directly in the click gesture, before network requests (iOS).
    const permission=await Notification.requestPermission();
    if(permission!=="granted")throw new Error("Chưa được cấp quyền. Hãy cho phép thông báo trong cài đặt trình duyệt/thiết bị.");
    await api("PUT",preferences);setSettings(previous=>previous?{...previous,preferences:{...preferences}}:previous);
    const registration=await navigator.serviceWorker.ready;
    const sub=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(settings!.publicKey!)});
    await api("POST",{action:"subscribe",subscription:sub.toJSON()});setEnabled(true);setMessage("Đã lưu lựa chọn và bật thông báo trên thiết bị này.");
  }
  const receiving=enabled&&pushKinds.some(kind=>settings?.preferences[kind]);
  return <>{standalone&&cardTarget&&createPortal(<aside className={`admin-push-card ${receiving?"is-enabled":""}`} aria-label="Thông báo trên thiết bị này">
    <Bell size={23} aria-hidden="true"/>
    <div><strong>{receiving?"Đang nhận thông báo quản trị":"Bật thông báo để không bỏ lỡ việc cần xử lý"}</strong>
      <p>{!settings?"Kiểm tra và thiết lập thông báo trên thiết bị này.":receiving?pushKinds.filter(kind=>settings.preferences[kind]).map(kind=>pushLabels[kind]).join(" · "):enabled?"Thiết bị đã kết nối, nhưng bạn chưa chọn loại thông báo nào.":"Chọn nhận cảnh báo sai tài khoản, giao dịch cần phân loại hoặc đồng bộ lỗi."}</p>
      <small>Bấm biểu tượng chuông ở đầu trang để thay đổi loại thông báo bất kỳ lúc nào.</small>
    </div>
    <button className="button primary small" onClick={()=>{setOpen(true);void load();}}>{receiving||enabled?"Cấu hình thông báo":"Bật thông báo"}</button>
  </aside>,cardTarget)}<Modal title="Bước 2/2 · Thông báo quản trị" open={open} onDismiss={dismiss} trigger={<><Bell size={16}/><span>Thông báo</span></>} triggerClassName="button subtle small" onOpen={()=>{setOpen(true);void load();}} footerNote="Lựa chọn áp dụng cho tài khoản quản trị của bạn; bật nhận riêng trên từng thiết bị.">
    {!settings&&busy?<LoadingIndicator label="Đang tải cài đặt…"/>:<>
      <p>{enabled?"Thiết bị này đã bật thông báo. Chọn lại các loại muốn nhận rồi bấm Lưu lựa chọn.":<>Chọn loại muốn nhận, bấm <strong>Lưu lựa chọn và bật thông báo</strong>, rồi chọn <strong>Cho phép</strong> nếu thiết bị hỏi quyền. Chỉ cần thực hiện một lần.</>}</p><p>Chọn các thông báo bạn muốn nhận:</p>
      <div className="push-options">{pushKinds.map(kind=><label key={kind}><input type="checkbox" checked={preferences[kind]} disabled={busy||!settings} onChange={e=>setPreferences({...preferences,[kind]:e.target.checked})}/><span>{pushLabels[kind]}{kind==="needsClassification"&&<small>Chưa xác định được thiện pháp; không gồm nhóm sai tài khoản.</small>}{kind==="syncError"&&<small>Lỗi lặp lại được gộp, tối đa một thông báo mỗi 30 phút.</small>}</span></label>)}</div>
      <p className="muted">Chỉ thông báo các sự kiện mới sau khi bật. Nội dung chuyển khoản và số tiền không xuất hiện trong thông báo.</p>
      {settings&&!settings.publicKey&&<p className="notice">Máy chủ chưa sẵn sàng gửi thông báo.</p>}
      {!supported&&<p className="notice">Trên iPhone/iPad (iOS 16.4+), hãy thêm ứng dụng vào Màn hình chính rồi mở từ biểu tượng. Nếu vẫn không hỗ trợ, hãy dùng trình duyệt mới hơn.</p>}
      {!enabled&&!Object.values(preferences).some(Boolean)&&<p className="muted">Chọn ít nhất một loại thông báo để bật.</p>}
      <div className="push-actions">
        <button className="button primary" disabled={busy||!settings||(!enabled&&(!supported||!settings.publicKey||!Object.values(preferences).some(Boolean)))} onClick={()=>void run(enabled?async()=>{await api("PUT",preferences);setSettings(previous=>previous?{...previous,preferences:{...preferences}}:previous);setMessage("Đã lưu các loại thông báo.");}:enable)}>{busy?"Đang xử lý…":enabled?"Lưu lựa chọn":"Lưu lựa chọn và bật thông báo"}</button>
        <button className="button subtle" disabled={busy} onClick={dismiss}>Để sau</button>
        {enabled?<>
          <button className="button subtle" disabled={busy} onClick={()=>void run(async()=>{const sub=await (await navigator.serviceWorker.ready).pushManager.getSubscription();if(sub){await api("DELETE",{endpoint:sub.endpoint});await sub.unsubscribe();}setEnabled(false);setMessage("Đã tắt thông báo trên thiết bị này.");})}>Tắt trên thiết bị này</button>
          <button className="button subtle" disabled={busy} onClick={()=>void run(async()=>{const sub=await (await navigator.serviceWorker.ready).pushManager.getSubscription();if(!sub)throw new Error("Cần bật lại thông báo trên thiết bị này.");await api("POST",{action:"test",endpoint:sub.endpoint});setMessage("Đã gửi thông báo thử tới thiết bị này.");})}>Gửi thử</button>
        </>:null}
      </div>
    </>}
    {error&&<p className="notice danger" role="alert">{error} <button className="button subtle small" disabled={busy} onClick={()=>void load()}>Tải lại</button></p>}
    {message&&<p role="status" className="notice">{message}</p>}
  </Modal></>;
}
