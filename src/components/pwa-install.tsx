"use client";
import {useEffect,useState,useSyncExternalStore} from "react";
import {Modal} from "@/components/modal";
import {Download} from "lucide-react";
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
const noopSubscribe=()=>()=>{};
function installedSnapshot(){return window.matchMedia("(display-mode: standalone)").matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;}
function installedSubscribe(callback:()=>void){const media=window.matchMedia("(display-mode: standalone)");media.addEventListener("change",callback);window.addEventListener("appinstalled",callback);return()=>{media.removeEventListener("change",callback);window.removeEventListener("appinstalled",callback);};}
export function PwaInstall(){
  const [prompt,setPrompt]=useState<InstallEvent|null>(null),[open,setOpen]=useState(false);
  const installed=useSyncExternalStore(installedSubscribe,installedSnapshot,()=>true);
  const ios=useSyncExternalStore(noopSubscribe,()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1),()=>false);
  useEffect(()=>{
    if("serviceWorker" in navigator)void navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"}).catch(()=>{});
    const offer=(event:Event)=>{event.preventDefault();setPrompt(event as InstallEvent);};
    const complete=()=>{setPrompt(null);};
    window.addEventListener("beforeinstallprompt",offer);window.addEventListener("appinstalled",complete);
    return()=>{window.removeEventListener("beforeinstallprompt",offer);window.removeEventListener("appinstalled",complete);};
  },[]);
  useEffect(()=>{
    if(installed)return;
    const timer=setTimeout(()=>{
      try{if(window.location.pathname.startsWith("/admin")&&(/Android|iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.maxTouchPoints>1)&&Number(localStorage.getItem("hvntvn-install-later")??0)<Date.now()&&!document.querySelector("dialog[open]"))setOpen(true);}catch{}
    },3000);
    return()=>clearTimeout(timer);
  },[installed]);
  function dismiss(){setOpen(false);try{localStorage.setItem("hvntvn-install-later",String(Date.now()+7*86400000));}catch{}}
  if(installed)return null;
  return <><Modal title="Bước 1/2 · Cài ứng dụng hvntvn" open={open} onDismiss={dismiss} footerNote="Có thể để sau và mở lại hướng dẫn cài ở cuối trang.">
    <p>Thêm hvntvn vào màn hình chính để mở nhanh như một ứng dụng.</p>
    <ol className="pwa-guide-steps">{ios?<><li>Mở website này bằng Safari.</li><li>Bấm Chia sẻ → Thêm vào Màn hình chính.</li><li>Giữ tên <strong>hvntvn</strong>, bấm Thêm.</li></>:<><li>Bấm “Cài ứng dụng” bên dưới nếu có, hoặc mở menu trình duyệt.</li><li>Chọn Cài đặt ứng dụng / Thêm vào màn hình chính và xác nhận.</li></>}<li>Mở <strong>hvntvn</strong> từ biểu tượng mới và đăng nhập quản trị nếu được yêu cầu.</li></ol>
    <p className="notice">Bước 2 sẽ hướng dẫn chọn loại thông báo và bật quyền nhận sau khi bạn mở ứng dụng đã cài.</p>
    <div className="push-actions">{prompt&&<button className="button primary" onClick={async()=>{await prompt.prompt();await prompt.userChoice;setPrompt(null);dismiss();}}>Cài ứng dụng</button>}<button className="button subtle" onClick={dismiss}>Để sau</button></div>
  </Modal><aside className="pwa-install">
    {prompt?<button className="button subtle small" onClick={async()=>{await prompt.prompt();await prompt.userChoice;setPrompt(null);}}><Download size={15}/>Cài ứng dụng hvntvn</button>:<details><summary>Cài ứng dụng lên điện thoại</summary><p>{ios?'Mở bằng Safari → Chia sẻ → Thêm vào Màn hình chính. Sau đó mở ứng dụng từ biểu tượng để bật thông báo quản trị.':'Trong menu trình duyệt, chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.'}</p></details>}
  <button className="button subtle small" onClick={()=>setOpen(true)}>Hướng dẫn cài đặt</button></aside></>;
}
