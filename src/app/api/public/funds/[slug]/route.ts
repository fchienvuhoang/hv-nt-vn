import {runtimeErrorDetails} from "@/lib/runtime-error";
import {withResponseTiming} from "@/lib/response-timing";
import {measureOperations} from "@/lib/operation-metrics";
import {after} from "next/server";
import { NextRequest,NextResponse } from "next/server";
import { snapshotResponse,warmPublicSnapshot } from "@/lib/public-snapshot";
import { publicQuery } from "@/lib/public-query";
export const maxDuration=300;
export async function GET(request:NextRequest,{params}:{params:Promise<{slug:string}>}){
  return withResponseTiming('route',()=>measureOperations("public-read",async()=>{
  const {slug}=await params;
  if(!/^[a-z0-9-]{1,100}$/.test(slug))return NextResponse.json({error:"Không tìm thấy thiện pháp."},{status:404});
  try{
    const started=performance.now();
    const query=publicQuery(Object.fromEntries(request.nextUrl.searchParams)),fund=await snapshotResponse(slug,query.page,query.direction,query.search);
    if(!fund)return NextResponse.json({error:"Không tìm thấy thiện pháp."},{status:404});
    if(!fund.hit)after(async()=>{
      try{await warmPublicSnapshot(slug);}catch{console.error("Public snapshot warmup failed");}
    });
    return NextResponse.json(fund.data,{headers:{"Cache-Control":"public, max-age=0, must-revalidate","X-Public-Cache":fund.hit?"HIT":"MISS","Server-Timing":`snapshot;dur=${(performance.now()-started).toFixed(1)}`}});
  }catch(error){console.error("Public ledger read failed",JSON.stringify(runtimeErrorDetails(error)));
    const missing=(error as {code?:string}|null)?.code==='DATABASE_NOT_CONFIGURED';
    return NextResponse.json({error:missing?"Chưa cấu hình DATABASE_URL trong runtime của Worker.":"Chưa tải được sao kê công khai. Vui lòng thử lại.",code:missing?'DATABASE_NOT_CONFIGURED':'PUBLIC_LEDGER_UNAVAILABLE'},{status:missing?503:500})}
  },after));
}
