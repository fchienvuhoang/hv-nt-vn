import { LoadingIndicator } from "@/components/loading-indicator";
import {Suspense} from "react";
import {publicDirectory} from "@/lib/public-data";
import {PublicDirectory} from "@/components/public-directory";
export const dynamic="force-dynamic";
export const metadata={title:"Minh bạch thiện pháp"};
export default async function DirectoryPage({searchParams}:{searchParams:Promise<{q?:string;page?:string}>}){
 const params=await searchParams,q=typeof params.q==="string"?params.q:"",page=typeof params.page==="string"?Number(params.page)||1:1;
 const initial=await publicDirectory(q,page);
 return <Suspense fallback={<LoadingIndicator label="Đang mở danh sách thiện pháp…"/>}><PublicDirectory initial={initial}/></Suspense>;
}
