"use client";
import type { AnchorHTMLAttributes } from "react";
export function PublicLink({href="",onClick,...props}:AnchorHTMLAttributes<HTMLAnchorElement>){
  return <a {...props} href={href} onClick={event=>{onClick?.(event);if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||props.target==="_blank")return;const url=new URL(href,window.location.href);if(url.origin===window.location.origin&&url.pathname===window.location.pathname){event.preventDefault();if(url.href!==window.location.href)window.history.pushState(null,"",url.pathname+url.search)}}}/>;
}
