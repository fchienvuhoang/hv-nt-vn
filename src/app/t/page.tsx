import {redirect} from "next/navigation";
export default async function LegacyDirectory({searchParams}:{searchParams:Promise<{q?:string;page?:string}>}){
 const params=await searchParams,query=new URLSearchParams();
 for(const key of ["q","page"] as const)if(typeof params[key]==="string")query.set(key,params[key]);
 redirect(`/minh-bach${query.size?`?${query}`:""}`);
}
