"use client";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

function pageOnly(event: BeforeSendEvent) {
  const url=new URL(event.url);
  url.search="";
  url.hash="";
  return {...event,url:url.toString()};
}

export function SiteAnalytics() {
  return <Analytics beforeSend={pageOnly} />;
}
