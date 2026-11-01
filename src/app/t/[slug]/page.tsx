import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicFundLedger } from "@/components/public-fund-ledger";

export const metadata: Metadata = { title: "Sao kê thiện pháp · Học viện nguyên thủy Việt Nam" };
export async function generateStaticParams(){return [];}
export default async function FundPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  if(!/^[a-z0-9-]{1,100}$/.test(slug))notFound();
  // The cached shell never waits for the ledger/database. Data loads through REST.
  return <PublicFundLedger key={slug} slug={slug}/>;
}
