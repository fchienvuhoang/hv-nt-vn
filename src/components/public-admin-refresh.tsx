"use client";
import {useEffect,useState} from "react";
export function PublicAdminRefresh({disabled,onRefresh}:{disabled:boolean;onRefresh:()=>void}){
 const [isAdmin,setIsAdmin]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();let checking=false;
  async function check(){
   if(checking||document.hidden)return;checking=true;
   try{
    const response=await fetch("/api/admin/session",{credentials:"same-origin",cache:"no-store",signal:controller.signal});
    if(!controller.signal.aborted)setIsAdmin(response.ok);
   }catch{if(!controller.signal.aborted)setIsAdmin(false)}
   finally{checking=false}
  }
  const visible=()=>{if(!document.hidden)void check()};
  void check();window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);
  return()=>{controller.abort();window.removeEventListener("focus",visible);document.removeEventListener("visibilitychange",visible)};
 },[]);
 if(!isAdmin)return null;
 return <button type="button" className="button subtle small" disabled={disabled} onClick={onRefresh}>Cập nhật số liệu</button>;
}
