"use client";
import {useEffect,useState,useSyncExternalStore} from "react";
import {Download} from "lucide-react";
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
const noopSubscribe=()=>()=>{};
function installedSnapshot(){return window.matchMedia("(display-mode: standalone)").matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;}
function installedSubscribe(callback:()=>void){const media=window.matchMedia("(display-mode: standalone)");media.addEventListener("change",callback);window.addEventListener("appinstalled",callback);return()=>{media.removeEventListener("change",callback);window.removeEventListener("appinstalled",callback);};}
export function PwaInstall(){
  const [prompt,setPrompt]=useState<InstallEvent|null>(null);
  const installed=useSyncExternalStore(installedSubscribe,installedSnapshot,()=>true);
  const ios=useSyncExternalStore(noopSubscribe,()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1),()=>false);
  useEffect(()=>{
    if("serviceWorker" in navigator)void navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"}).catch(()=>{});
    const offer=(event:Event)=>{event.preventDefault();setPrompt(event as InstallEvent);};
    const complete=()=>{setPrompt(null);};
    window.addEventListener("beforeinstallprompt",offer);window.addEventListener("appinstalled",complete);
    return()=>{window.removeEventListener("beforeinstallprompt",offer);window.removeEventListener("appinstalled",complete);};
  },[]);
  if(installed)return null;
  return <aside className="pwa-install">
    {prompt?<button className="button subtle small" onClick={async()=>{await prompt.prompt();await prompt.userChoice;setPrompt(null);}}><Download size={15}/>Cài ứng dụng hvntvn</button>:<details><summary>Cài ứng dụng lên điện thoại</summary><p>{ios?'Mở bằng Safari → Chia sẻ → Thêm vào Màn hình chính. Sau đó mở ứng dụng từ biểu tượng để bật thông báo quản trị.':'Trong menu trình duyệt, chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.'}</p></details>}
  </aside>;
}
