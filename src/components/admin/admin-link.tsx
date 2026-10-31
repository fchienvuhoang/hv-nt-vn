"use client";
import type { AnchorHTMLAttributes } from "react";
import { useSearchParams } from "next/navigation";
import type { AdminParams } from "@/lib/admin-navigation";
export function adminNavigate(href:string,replace=false){
  if(replace)window.history.replaceState(null,"",href);else if(new URL(href,window.location.href).href!==window.location.href)window.history.pushState(null,"",href);
}
export function useAdminParams():AdminParams {const params=useSearchParams();return Object.fromEntries(params.entries())}
export function AdminLink({href="/admin",onClick,scroll: _scroll,...props}:AnchorHTMLAttributes<HTMLAnchorElement>&{scroll?:boolean}){
  void _scroll;
  return <a {...props} href={href} onClick={event=>{onClick?.(event);if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||props.target==="_blank")return;const url=new URL(href,window.location.href);if(url.origin===window.location.origin&&url.pathname==="/admin"){event.preventDefault();adminNavigate(url.pathname+url.search)}}}/>;
}
