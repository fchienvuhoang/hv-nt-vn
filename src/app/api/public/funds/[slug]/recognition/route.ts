import {NextRequest,NextResponse} from "next/server";
import {loadRecognition} from "@/lib/fund-recognition";
export async function GET(request:NextRequest,{params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 if(!/^[a-z0-9-]{1,100}$/.test(slug))return NextResponse.json({error:"Không tìm thấy danh sách."},{status:404});
 try{
   const data=await loadRecognition({slug},Math.min(100000,Number(request.nextUrl.searchParams.get("page"))||1),request.nextUrl.searchParams.get("q")??"");
   if(!data)return NextResponse.json({error:"Thiện pháp chưa bật danh sách phương danh."},{status:404});
   return NextResponse.json({...data,rows:data.rows.map(({id,nameOverride,...row})=>{void id;void nameOverride;return row})},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Chưa tải được danh sách. Vui lòng thử lại."},{status:500});}
}
