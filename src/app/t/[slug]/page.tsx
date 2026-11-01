import { LoadingIndicator } from "@/components/loading-indicator";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicFund,publicFundDTO,publicFundTitle } from "@/lib/public-data";
import { publicQuery } from "@/lib/public-query";
import { PublicFundLedger } from "@/components/public-fund-ledger";
export const revalidate=30;
export async function generateStaticParams(){return [];}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params;
  if(!/^[a-z0-9-]{1,100}$/.test(slug))notFound();
  const title=await publicFundTitle(slug);
  if(!title)notFound();
  return {title:{absolute:title}};
}
export default async function FundPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;if(!/^[a-z0-9-]{1,100}$/.test(slug))notFound();
  // Cache the initial public document; URL filters load through REST after hydration.
  const query=publicQuery({}),fund=await publicFund(slug,query.page,query.direction,query.search);if(!fund)notFound();
  return <Suspense fallback={<LoadingIndicator label="Đang mở sao kê công khai…"/>}><PublicFundLedger slug={slug} initial={publicFundDTO(fund)} initialKey={JSON.stringify(query)}/></Suspense>;
}
