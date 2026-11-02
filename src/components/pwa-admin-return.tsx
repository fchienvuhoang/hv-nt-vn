"use client";
import {useSyncExternalStore} from "react";
import {ArrowLeft} from "lucide-react";
const subscribe=()=>()=>{};
export function PwaAdminReturn(){
  const installed=useSyncExternalStore(subscribe,()=>window.matchMedia("(display-mode: standalone)").matches||(navigator as Navigator&{standalone?:boolean}).standalone===true,()=>false);
  if(!installed)return null;
  return <a href="/admin" className="button subtle small pwa-admin-return"><ArrowLeft size={16}/>Về quản trị</a>;
}
