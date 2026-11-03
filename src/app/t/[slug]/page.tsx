import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {publicFundTitle} from "@/lib/public-data";
import { PublicFundLedger } from "@/components/public-fund-ledger";

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params;
  let title="Thiện pháp";
  if(/^[a-z0-9-]{1,100}$/.test(slug))try{title=await publicFundTitle(slug)??title}catch{/* The REST view can still display its loading/error state. */}
  return {title:{absolute:title},openGraph:{title}};
}
export async function generateStaticParams(){return [];}
export default async function FundPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  if(!/^[a-z0-9-]{1,100}$/.test(slug))notFound();
  // The cached shell never waits for the ledger/database. Data loads through REST.
  return <PublicFundLedger key={slug} slug={slug}/>;
}
