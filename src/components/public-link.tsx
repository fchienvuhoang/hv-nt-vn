"use client";
import {useSyncExternalStore,type AnchorHTMLAttributes} from "react";
function subscribe(listener:()=>void){window.addEventListener("popstate",listener);window.addEventListener("public:navigate",listener);return()=>{window.removeEventListener("popstate",listener);window.removeEventListener("public:navigate",listener)}}
export function usePublicSearch(){return useSyncExternalStore(subscribe,()=>window.location.search,()=>"")}
export function publicNavigate(href:string){if(new URL(href,window.location.href).href!==window.location.href){window.history.pushState(null,"",href);window.dispatchEvent(new Event("public:navigate"));}}
export function PublicLink({href="",onClick,...props}:AnchorHTMLAttributes<HTMLAnchorElement>){
  return <a {...props} href={href} onClick={event=>{onClick?.(event);if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||props.target==="_blank")return;const url=new URL(href,window.location.href);if(url.origin===window.location.origin&&url.pathname===window.location.pathname){event.preventDefault();publicNavigate(url.pathname+url.search)}}}/>;
}
