import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicFund,publicFundDTO,publicFundTitle } from "@/lib/public-data";
import { publicQuery } from "@/lib/public-query";
import { PublicFundLedger } from "@/components/public-fund-ledger";
export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params;
  if(!/^[a-z0-9-]{1,100}$/.test(slug))notFound();
  const title=await publicFundTitle(slug);
  if(!title)notFound();
  return {title:{absolute:title}};
}
export default async function FundPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{page?:string;type?:string;q?:string}>}){
  const {slug}=await params;if(!/^[a-z0-9-]{1,100}$/.test(slug))notFound();
  const query=publicQuery(await searchParams),fund=await publicFund(slug,query.page,query.direction,query.search);if(!fund)notFound();
  return <Suspense fallback={<p role="status">Đang mở sao kê công khai…</p>}><PublicFundLedger slug={slug} initial={publicFundDTO(fund)} initialKey={JSON.stringify(query)}/></Suspense>;
}
