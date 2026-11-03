import {measureOperations} from "@/lib/operation-metrics";
import { NextRequest,NextResponse } from "next/server";
import { snapshotResponse } from "@/lib/public-snapshot";
import { publicQuery } from "@/lib/public-query";
export async function GET(request:NextRequest,{params}:{params:Promise<{slug:string}>}){
  return measureOperations("public-read",async()=>{
  const {slug}=await params;
  if(!/^[a-z0-9-]{1,100}$/.test(slug))return NextResponse.json({error:"Không tìm thấy thiện pháp."},{status:404});
  try{
    const query=publicQuery(Object.fromEntries(request.nextUrl.searchParams)),fund=await snapshotResponse(slug,query.page,query.direction,query.search);
    if(!fund)return NextResponse.json({error:"Không tìm thấy thiện pháp."},{status:404});
    return NextResponse.json(fund.data,{headers:{"Cache-Control":"public, max-age=0, must-revalidate","X-Public-Cache":fund.hit?"HIT":"MISS"}});
  }catch{return NextResponse.json({error:"Chưa tải được sao kê công khai. Vui lòng thử lại."},{status:500})}
  });
}
